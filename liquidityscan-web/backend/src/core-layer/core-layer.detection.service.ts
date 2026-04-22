import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    CoreLayerVariantKey,
    Direction,
    LIVE_SIGNAL_STATUSES,
    SePatternKind,
    STRATEGY_TYPE_TO_VARIANT,
    Tf,
    VARIANT_STRATEGY_TYPE,
    normalizeTimeframe,
} from './core-layer.constants';
import {
    classifyAnchor,
    inferSePatternKind,
    normalizeDirection,
} from './core-layer.helpers';
import { CoreLayerLifecycleService } from './core-layer.lifecycle.service';

/**
 * CoreLayerDetectionService — the "find aligned chains" half of the backend.
 *
 * Piggybacks on the hourly ScannerService pass (ADR D14 — same clock, same
 * scan window). After the upstream SE/CRT/ICT-BIAS scanners have finished
 * persisting their per-TF signal rows into `super_engulfing_signals`, this
 * service:
 *
 *   1. Reads all currently-live (PENDING | ACTIVE) rows grouped by variant
 *      (SE = SUPER_ENGULFING, CRT = CRT, BIAS = ICT_BIAS).
 *   2. Collapses each variant's rows into (pair, direction) chains of TFs.
 *   3. Feeds each ≥2-TF chain to CoreLayerLifecycleService.upsertChain(),
 *      which owns the core_layer_signals table and writes history.
 *   4. Sweeps the remaining ACTIVE chains via advanceLifecycles() so TFs that
 *      have expired since the last scan get demoted / the chain gets closed.
 *
 * Runtime is gated by CORE_LAYER_ENABLED (default false, wired in Commit 4).
 * With the flag off, this service is registered in DI but never invoked —
 * zero cost to the rest of the pipeline.
 */

type RawSignalRow = {
    id: string;
    strategyType: string;
    symbol: string;
    timeframe: string;
    signalType: string | null;
    detectedAt: Date;
    pattern_v2: string | null;
};

@Injectable()
export class CoreLayerDetectionService {
    private readonly logger = new Logger(CoreLayerDetectionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly lifecycle: CoreLayerLifecycleService,
    ) {}

    /**
     * Run one full detection pass. Safe to call even when there are zero
     * upstream signals — it just writes nothing and returns zeroed counters.
     */
    async runDetection(now: number = Date.now()): Promise<{
        created: number;
        promoted: number;
        demoted: number;
        anchorChanged: number;
        closed: number;
        scannedVariants: number;
    }> {
        const start = Date.now();
        const counters = {
            created: 0,
            promoted: 0,
            demoted: 0,
            anchorChanged: 0,
            closed: 0,
            scannedVariants: 0,
        };

        // Pull every live row for all three variants in one query, then partition in-process.
        const strategyTypes = Object.values(VARIANT_STRATEGY_TYPE);
        const rows = (await this.prisma.superEngulfingSignal.findMany({
            where: {
                strategyType: { in: strategyTypes },
                lifecycleStatus: { in: LIVE_SIGNAL_STATUSES as unknown as any[] },
            },
            select: {
                id: true,
                strategyType: true,
                symbol: true,
                timeframe: true,
                signalType: true,
                detectedAt: true,
                pattern_v2: true,
            },
        })) as RawSignalRow[];

        // For each variant, fold rows into (pair, direction) → chain definition.
        for (const variant of ['SE', 'CRT', 'BIAS'] as CoreLayerVariantKey[]) {
            counters.scannedVariants++;
            const variantRows = rows.filter(
                (r) => STRATEGY_TYPE_TO_VARIANT[r.strategyType] === variant,
            );

            // Note: do NOT short-circuit when variantRows is empty. The orphan-close sweep
            // below MUST still run so that ACTIVE Core-Layer chains whose upstream rows all
            // cleared out since the last scan get closed — this is the common end-of-life
            // path for a chain.

            const chains = this.collapseToChains(variantRows, variant);
            const seenKeys = new Set<string>();

            for (const chain of chains) {
                const outcome = await this.lifecycle.upsertChain({
                    pair: chain.pair,
                    variant,
                    direction: chain.direction,
                    chain: chain.tfs,
                    tfLastCandleClose: chain.tfLastCandleClose,
                    sePerTf: chain.sePerTf,
                    now,
                });
                if (outcome === 'created') counters.created++;
                else if (outcome === 'promoted') counters.promoted++;
                else if (outcome === 'demoted') counters.demoted++;
                else if (outcome === 'anchor_changed') counters.anchorChanged++;

                seenKeys.add(`${chain.pair}|${variant}|${chain.direction}`);
            }

            // Close ACTIVE chains for this variant that no longer have any upstream signal.
            const orphaned = await this.prisma.coreLayerSignal.findMany({
                where: { variant, status: 'ACTIVE' },
                select: { id: true, pair: true, direction: true, chain: true },
            });
            for (const row of orphaned) {
                const key = `${row.pair}|${variant}|${row.direction}`;
                if (!seenKeys.has(key)) {
                    await this.prisma.$transaction(async (tx) => {
                        await tx.coreLayerSignal.update({
                            where: { id: row.id },
                            data: { status: 'CLOSED', closedAt: new Date(now) },
                        });
                        await tx.coreLayerHistoryEntry.create({
                            data: {
                                signalId: row.id,
                                at: new Date(now),
                                event: 'closed',
                                fromDepth: Array.isArray(row.chain) ? row.chain.length : 0,
                                toDepth: 0,
                                note: 'Upstream signals all cleared.',
                            },
                        });
                    });
                    counters.closed++;
                }
            }
        }

        // Second pass: advance lifecycles for rows whose TFs aged out since the last scan
        // even though the upstream row was still marked live. Mostly relevant during dev
        // when scans skip candle windows, but cheap in prod — indexed status scan.
        const swept = await this.lifecycle.advanceLifecycles(now);
        counters.demoted += swept.demoted;
        counters.anchorChanged += swept.anchorChanged;
        counters.closed += swept.closed;

        const elapsed = Date.now() - start;
        this.logger.log(
            `runDetection: created=${counters.created} promoted=${counters.promoted} demoted=${counters.demoted} anchorChanged=${counters.anchorChanged} closed=${counters.closed} in ${elapsed}ms`,
        );
        return counters;
    }

    /**
     * Collapse per-TF SuperEngulfingSignal rows into (pair, direction, variant)
     * chains. Returns one entry per chain that is ≥2 TFs deep AND has a valid
     * anchor. Shorter chains and anchor-less combos are filtered here so the
     * lifecycle layer only sees things worth writing.
     */
    private collapseToChains(
        rows: RawSignalRow[],
        variant: CoreLayerVariantKey,
    ): Array<{
        pair: string;
        direction: Direction;
        tfs: Tf[];
        tfLastCandleClose: Partial<Record<Tf, number>>;
        sePerTf?: Partial<Record<Tf, SePatternKind>>;
    }> {
        const buckets = new Map<
            string,
            {
                pair: string;
                direction: Direction;
                tfs: Set<Tf>;
                tfLastCandleClose: Partial<Record<Tf, number>>;
                sePerTf: Partial<Record<Tf, SePatternKind>>;
            }
        >();

        for (const row of rows) {
            const tf = normalizeTimeframe(row.timeframe);
            if (!tf) continue;
            const direction = normalizeDirection(row.signalType);
            if (!direction) continue;

            const key = `${row.symbol}|${direction}`;
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = {
                    pair: row.symbol,
                    direction,
                    tfs: new Set(),
                    tfLastCandleClose: {},
                    sePerTf: {},
                };
                buckets.set(key, bucket);
            }

            bucket.tfs.add(tf);
            // Keep the MOST RECENT row per TF as the representative. Pre-existing rows
            // at the same TF (e.g. multiple SE patterns on the same candle close) collapse
            // to the one with the latest detectedAt.
            const prev = bucket.tfLastCandleClose[tf];
            const next = row.detectedAt.getTime();
            if (prev === undefined || next > prev) {
                bucket.tfLastCandleClose[tf] = next;
                if (variant === 'SE') {
                    const pat = inferSePatternKind(row.pattern_v2);
                    if (pat) bucket.sePerTf[tf] = pat;
                }
            }
        }

        const out: Array<{
            pair: string;
            direction: Direction;
            tfs: Tf[];
            tfLastCandleClose: Partial<Record<Tf, number>>;
            sePerTf?: Partial<Record<Tf, SePatternKind>>;
        }> = [];
        for (const bucket of buckets.values()) {
            if (bucket.tfs.size < 2) continue;
            const tfs = Array.from(bucket.tfs);
            // Double-check anchor early so we don't make the lifecycle service
            // perform an expensive transaction just to discover there's no anchor.
            if (!classifyAnchor(tfs)) continue;
            out.push({
                pair: bucket.pair,
                direction: bucket.direction,
                tfs,
                tfLastCandleClose: bucket.tfLastCandleClose,
                sePerTf: variant === 'SE' ? bucket.sePerTf : undefined,
            });
        }
        return out;
    }
}
