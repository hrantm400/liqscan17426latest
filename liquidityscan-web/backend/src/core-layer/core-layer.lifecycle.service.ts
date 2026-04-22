import { Injectable, Logger } from '@nestjs/common';
import { CoreLayerSignal, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    AnchorType,
    CoreLayerVariantKey,
    Direction,
    SePatternKind,
    Tf,
    TfLifeState,
} from './core-layer.constants';
import {
    classifyAnchor,
    computeLifeState,
    computePlusSummary,
    findCorrelationPairs,
    isTfExpired,
    sortChain,
} from './core-layer.helpers';

/**
 * CoreLayerLifecycleService — owns the CoreLayerSignal table.
 *
 * Two public entry points:
 *
 *   1. upsertChain(...) — called by CoreLayerDetectionService once per
 *      (pair, variant, direction) group discovered in the current scan pass.
 *      Creates a new chain row, or promotes/demotes/anchor_changes an existing
 *      ACTIVE one, and writes the corresponding history entry.
 *
 *   2. advanceLifecycles(now) — housekeeping sweep. Reads all ACTIVE rows,
 *      recomputes per-TF life state from the stored last-candle-close
 *      timestamps, drops TFs whose dt has exceeded the close threshold
 *      (3 × candleMs per spec), and CLOSES the row if the chain collapses
 *      below two TFs (ADR D10: minimum chain length = 2).
 *
 * Both paths write append-only CoreLayerHistoryEntry rows so the UI pair-detail
 * view has a truthful audit trail (ADR D14).
 */

type UpsertChainArgs = {
    pair: string;
    variant: CoreLayerVariantKey;
    direction: Direction;
    /** Canonical-order chain as derived by the caller. */
    chain: Tf[];
    /** ms-epoch of the signal candle's close, per TF. */
    tfLastCandleClose: Partial<Record<Tf, number>>;
    /** SE variant only: pattern kind per TF (REV/REV+/RUN/RUN+). */
    sePerTf?: Partial<Record<Tf, SePatternKind>>;
    /** Frozen scan timestamp. All per-chain work in a single pass uses the same `now`. */
    now: number;
};

type UpsertChainOutcome = 'created' | 'promoted' | 'demoted' | 'anchor_changed' | 'unchanged';

@Injectable()
export class CoreLayerLifecycleService {
    private readonly logger = new Logger(CoreLayerLifecycleService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Create or update the ACTIVE CoreLayerSignal row for one (pair, variant, direction).
     * Returns the outcome so the caller can aggregate counters for the scan log.
     */
    async upsertChain(args: UpsertChainArgs): Promise<UpsertChainOutcome> {
        const { pair, variant, direction, tfLastCandleClose, sePerTf, now } = args;
        const chain = sortChain(args.chain);

        const anchor = classifyAnchor(chain);
        if (!anchor) {
            // Chain lacks a valid anchor TF. Skip — detection caller already guards for
            // chain.length >= 2, so this only fires for exotic combos (e.g. 1H-only, which
            // we do not surface in v1).
            return 'unchanged';
        }

        const tfLifeState = this.buildLifeStateMap(chain, tfLastCandleClose, now);
        const correlationPairs = findCorrelationPairs(chain);
        const plusSummary = variant === 'SE' ? computePlusSummary(chain, sePerTf) : null;

        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.coreLayerSignal.findFirst({
                where: { pair, variant, direction, status: 'ACTIVE' },
            });

            if (!existing) {
                const created = await tx.coreLayerSignal.create({
                    data: {
                        pair,
                        variant,
                        direction,
                        anchor,
                        chain,
                        depth: chain.length,
                        correlationPairs: correlationPairs as unknown as Prisma.InputJsonValue,
                        tfLifeState: tfLifeState as unknown as Prisma.InputJsonValue,
                        tfLastCandleClose:
                            tfLastCandleClose as unknown as Prisma.InputJsonValue,
                        sePerTf: sePerTf
                            ? (sePerTf as unknown as Prisma.InputJsonValue)
                            : Prisma.JsonNull,
                        plusSummary,
                        status: 'ACTIVE',
                        detectedAt: new Date(now),
                        lastPromotedAt: new Date(now),
                    },
                });
                await tx.coreLayerHistoryEntry.create({
                    data: {
                        signalId: created.id,
                        at: new Date(now),
                        event: 'created',
                        toDepth: chain.length,
                        toAnchor: anchor,
                    },
                });
                return 'created' as const;
            }

            // Reconcile. Determine what changed.
            const prevChain = existing.chain as Tf[];
            const prevAnchor = existing.anchor as AnchorType;
            const depthDelta = chain.length - prevChain.length;

            const tfAdded = chain.find((tf) => !prevChain.includes(tf));
            const tfRemoved = prevChain.find((tf) => !chain.includes(tf));
            const chainsEqual = prevChain.join(',') === chain.join(',');

            if (chainsEqual && prevAnchor === anchor) {
                // Still useful to refresh life-state / lastCandleClose / plusSummary —
                // they can move even when chain membership is stable.
                await tx.coreLayerSignal.update({
                    where: { id: existing.id },
                    data: {
                        tfLifeState: tfLifeState as unknown as Prisma.InputJsonValue,
                        tfLastCandleClose:
                            tfLastCandleClose as unknown as Prisma.InputJsonValue,
                        sePerTf: sePerTf
                            ? (sePerTf as unknown as Prisma.InputJsonValue)
                            : Prisma.JsonNull,
                        plusSummary,
                    },
                });
                return 'unchanged' as const;
            }

            await tx.coreLayerSignal.update({
                where: { id: existing.id },
                data: {
                    anchor,
                    chain,
                    depth: chain.length,
                    correlationPairs: correlationPairs as unknown as Prisma.InputJsonValue,
                    tfLifeState: tfLifeState as unknown as Prisma.InputJsonValue,
                    tfLastCandleClose: tfLastCandleClose as unknown as Prisma.InputJsonValue,
                    sePerTf: sePerTf
                        ? (sePerTf as unknown as Prisma.InputJsonValue)
                        : Prisma.JsonNull,
                    plusSummary,
                    lastPromotedAt: depthDelta > 0 ? new Date(now) : existing.lastPromotedAt,
                },
            });

            // Emit a single history entry per change in priority order:
            //   promoted > demoted > anchor_changed
            // Anchor-only changes (same depth, different anchor) still write one row.
            let event: 'promoted' | 'demoted' | 'anchor_changed';
            if (depthDelta > 0) event = 'promoted';
            else if (depthDelta < 0) event = 'demoted';
            else event = 'anchor_changed';

            await tx.coreLayerHistoryEntry.create({
                data: {
                    signalId: existing.id,
                    at: new Date(now),
                    event,
                    fromDepth: prevChain.length,
                    toDepth: chain.length,
                    fromAnchor: prevAnchor !== anchor ? prevAnchor : null,
                    toAnchor: prevAnchor !== anchor ? anchor : null,
                    tfAdded: tfAdded ?? null,
                    tfRemoved: tfRemoved ?? null,
                },
            });

            return event === 'promoted' ? 'promoted' : event === 'demoted' ? 'demoted' : 'anchor_changed';
        });
    }

    /**
     * Sweep all ACTIVE rows, drop expired TFs, close the chain when it falls
     * below the 2-TF minimum or loses its anchor. Counters are returned for
     * logging.
     */
    async advanceLifecycles(now: number): Promise<{
        demoted: number;
        anchorChanged: number;
        closed: number;
    }> {
        const active = await this.prisma.coreLayerSignal.findMany({
            where: { status: 'ACTIVE' },
        });

        let demoted = 0;
        let anchorChanged = 0;
        let closed = 0;

        for (const row of active) {
            const outcome = await this.evolveOne(row, now);
            if (outcome === 'demoted') demoted++;
            else if (outcome === 'anchor_changed') anchorChanged++;
            else if (outcome === 'closed') closed++;
        }

        if (demoted || anchorChanged || closed) {
            this.logger.log(
                `advanceLifecycles: demoted=${demoted} anchorChanged=${anchorChanged} closed=${closed} (scanned=${active.length})`,
            );
        }
        return { demoted, anchorChanged, closed };
    }

    /**
     * Evolve one ACTIVE row by re-deriving state from the stored
     * last-candle-close map. This path NEVER promotes — promotion only happens
     * in upsertChain() where fresh scanner rows are the source of truth.
     */
    private async evolveOne(
        row: CoreLayerSignal,
        now: number,
    ): Promise<'demoted' | 'anchor_changed' | 'closed' | 'unchanged'> {
        const storedCloses = row.tfLastCandleClose as Partial<Record<Tf, number>>;
        const prevChain = row.chain as Tf[];

        const survivingChain = sortChain(
            prevChain.filter((tf) => {
                const close = storedCloses[tf];
                return typeof close === 'number' && !isTfExpired(tf, close, now);
            }),
        );

        if (survivingChain.length === prevChain.length) {
            // No TF expired — nothing to do here. Life-state refresh is a
            // read-time concern (API derives it on the fly).
            return 'unchanged';
        }

        if (survivingChain.length < 2) {
            return this.closeChain(row, now, 'Chain collapsed below 2-TF minimum.');
        }

        const newAnchor = classifyAnchor(survivingChain);
        if (!newAnchor) {
            return this.closeChain(row, now, 'Chain lost a valid anchor.');
        }

        const removedTfs = prevChain.filter((tf) => !survivingChain.includes(tf));
        const anchorChanged = newAnchor !== row.anchor;
        const newLifeState = this.buildLifeStateMap(survivingChain, storedCloses, now);
        const newCorrelation = findCorrelationPairs(survivingChain);
        const newSePerTf = this.filterSePerTf(row.sePerTf, survivingChain);
        const newPlusSummary =
            row.variant === 'SE' ? computePlusSummary(survivingChain, newSePerTf ?? undefined) : null;

        await this.prisma.$transaction(async (tx) => {
            await tx.coreLayerSignal.update({
                where: { id: row.id },
                data: {
                    chain: survivingChain,
                    depth: survivingChain.length,
                    anchor: newAnchor,
                    correlationPairs:
                        newCorrelation as unknown as Prisma.InputJsonValue,
                    tfLifeState: newLifeState as unknown as Prisma.InputJsonValue,
                    // tfLastCandleClose is intentionally not updated — it remains the historical
                    // record of the last observed close per TF, so future lifecycle ticks stay
                    // deterministic. Dropped TFs just stop being indexed by the chain array.
                    sePerTf: newSePerTf
                        ? (newSePerTf as unknown as Prisma.InputJsonValue)
                        : Prisma.JsonNull,
                    plusSummary: newPlusSummary,
                },
            });
            await tx.coreLayerHistoryEntry.create({
                data: {
                    signalId: row.id,
                    at: new Date(now),
                    event: anchorChanged && removedTfs.length === 0 ? 'anchor_changed' : 'demoted',
                    fromDepth: prevChain.length,
                    toDepth: survivingChain.length,
                    fromAnchor: anchorChanged ? (row.anchor as string) : null,
                    toAnchor: anchorChanged ? newAnchor : null,
                    tfRemoved: removedTfs[0] ?? null,
                    note:
                        removedTfs.length > 1
                            ? `Dropped ${removedTfs.length} TFs: ${removedTfs.join(',')}`
                            : null,
                },
            });
        });

        return anchorChanged && removedTfs.length === 0 ? 'anchor_changed' : 'demoted';
    }

    /** Close the chain in a transaction. Writes one 'closed' history row. */
    private async closeChain(
        row: CoreLayerSignal,
        now: number,
        note: string,
    ): Promise<'closed'> {
        await this.prisma.$transaction(async (tx) => {
            await tx.coreLayerSignal.update({
                where: { id: row.id },
                data: {
                    status: 'CLOSED',
                    closedAt: new Date(now),
                },
            });
            await tx.coreLayerHistoryEntry.create({
                data: {
                    signalId: row.id,
                    at: new Date(now),
                    event: 'closed',
                    fromDepth: (row.chain as Tf[]).length,
                    toDepth: 0,
                    note,
                },
            });
        });
        return 'closed';
    }

    private buildLifeStateMap(
        chain: Tf[],
        closes: Partial<Record<Tf, number>>,
        now: number,
    ): Partial<Record<Tf, TfLifeState>> {
        const out: Partial<Record<Tf, TfLifeState>> = {};
        for (const tf of chain) {
            const close = closes[tf];
            if (typeof close === 'number') {
                out[tf] = computeLifeState(tf, close, now);
            }
        }
        return out;
    }

    private filterSePerTf(
        stored: unknown,
        survivingChain: Tf[],
    ): Partial<Record<Tf, SePatternKind>> | null {
        if (!stored || typeof stored !== 'object') return null;
        const src = stored as Partial<Record<Tf, SePatternKind>>;
        const out: Partial<Record<Tf, SePatternKind>> = {};
        for (const tf of survivingChain) {
            const v = src[tf];
            if (v) out[tf] = v;
        }
        return Object.keys(out).length > 0 ? out : null;
    }
}
