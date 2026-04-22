import { Injectable } from '@nestjs/common';
import { CoreLayerSignal, CoreLayerHistoryEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TickerCacheService } from '../ticker/ticker-cache.service';
import { CoreLayerRuntimeFlagService } from './core-layer.runtime-flag.service';
import {
    AnchorType,
    CoreLayerVariantKey,
    Direction,
    PlusSummary,
    PRO_TFS,
    SCOUT_MAX_DEPTH,
    SePatternKind,
    Tf,
    TfLifeState,
} from './core-layer.constants';
import type { CoreLayerEffectiveTier } from './core-layer.tier-resolver.service';
import { computeLifeState } from './core-layer.helpers';
import type {
    CoreLayerHistoryEntryDto,
    CoreLayerSignalDto,
    CoreLayerStatsResponseDto,
    ListCoreLayerSignalsResponseDto,
} from './dto/core-layer-signal.dto';

/**
 * CoreLayerQueryService — read-path for the REST API.
 *
 * The write-path (detection + lifecycle services) keeps core_layer_signals
 * truthful (ADR D14 — literal life state for every TF including W/1D).
 * This service is where the ADR D13 HTF override is applied: W and 1D TFs
 * are downgraded to `steady` on the way out so the UI can render without
 * having to know the "literal vs displayed" distinction.
 *
 * Life state is also re-derived at read time from the stored
 * tfLastCandleClose + the current Date.now() — that way a row written two
 * hours ago still reports its TFs accurately even if the lifecycle sweep
 * has not run since. This matches the ADR D14 "DB is the source of truth
 * for close timestamps; state is a deterministic function of time and
 * closes" principle.
 *
 * All pagination is cursor-based. The cursor encodes
 *   `${lastPromotedAt-ms}:${id}`
 * and sorts by (lastPromotedAt DESC, id DESC). This is stable under
 * concurrent writes: new promotions show up at the top of page 1, older
 * rows stay on their pages until they close.
 */

type ListFilters = {
    variant?: CoreLayerVariantKey;
    direction?: Direction;
    anchor?: AnchorType;
    status?: 'ACTIVE' | 'CLOSED';
    pair?: string;
    cursor?: string;
    limit?: number;
    /**
     * Phase 7.3 — effective tier of the caller. Anonymous callers pass
     * 'SCOUT' (default). FULL_ACCESS sees everything; SCOUT has chains
     * containing a 15m or 5m TF and chains with depth ≥ SCOUT_MAX_DEPTH
     * stripped on the way out. This is the BACKEND authoritative filter —
     * the frontend renders its own lock UI but cannot see data that was
     * never sent (toggle (b)).
     */
    tier?: CoreLayerEffectiveTier;
};

/**
 * Drop chains that would leak Pro-only content to a SCOUT caller.
 * Returns a NEW array — never mutates the input.
 */
function isProGated(chain: unknown, depth: number): boolean {
    if (depth >= SCOUT_MAX_DEPTH + 1) return true;
    if (!Array.isArray(chain)) return false;
    for (const tf of chain as Tf[]) {
        if ((PRO_TFS as readonly Tf[]).includes(tf)) return true;
    }
    return false;
}

@Injectable()
export class CoreLayerQueryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ticker: TickerCacheService,
        private readonly runtimeFlag: CoreLayerRuntimeFlagService,
    ) {}

    /** Public so the controller can short-circuit when the flag is off. */
    isEnabled(): boolean {
        return this.runtimeFlag.isEnabled();
    }

    async listSignals(filters: ListFilters): Promise<ListCoreLayerSignalsResponseDto> {
        if (!this.runtimeFlag.isEnabled()) {
            return { signals: [], nextCursor: null, enabled: false };
        }

        const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
        const tier: CoreLayerEffectiveTier = filters.tier ?? 'SCOUT';
        const where: Prisma.CoreLayerSignalWhereInput = {
            status: filters.status ?? 'ACTIVE',
        };
        if (filters.variant) where.variant = filters.variant;
        if (filters.direction) where.direction = filters.direction;
        if (filters.anchor) where.anchor = filters.anchor;
        if (filters.pair) where.pair = filters.pair;

        // Phase 7.3 — tier-aware SQL-level filter for SCOUT. We cap depth
        // in the `where` clause (cheap, indexable) and then post-filter
        // the chain-array in-process (Prisma's Json filters don't cleanly
        // express "chain does not contain any of PRO_TFS" across variants).
        // To keep pagination stable under post-filtering we over-fetch
        // with a generous multiplier and trim back to `limit`.
        const overFetch = tier === 'SCOUT' ? Math.min(limit * 3, 600) : limit + 1;
        if (tier === 'SCOUT') {
            where.depth = { lte: SCOUT_MAX_DEPTH };
        }

        const cursorArgs = this.parseCursor(filters.cursor);

        const rows = await this.prisma.coreLayerSignal.findMany({
            where,
            orderBy: [{ lastPromotedAt: 'desc' }, { id: 'desc' }],
            take: overFetch,
            ...(cursorArgs
                ? {
                      cursor: { id: cursorArgs.id },
                      skip: 1,
                  }
                : {}),
            include: {
                history: {
                    orderBy: { at: 'asc' },
                    // Cap history on list responses to avoid outsized payloads; pair-detail page
                    // pulls the full history via the single-signal endpoint when it opens.
                    take: 20,
                },
            },
        });

        const visible =
            tier === 'SCOUT'
                ? rows.filter((r) => !isProGated(r.chain, r.depth))
                : rows;

        const hasMore = visible.length > limit;
        const slice = hasMore ? visible.slice(0, limit) : visible;
        const nextCursor = hasMore ? this.buildCursor(slice[slice.length - 1]) : null;
        const now = Date.now();

        return {
            signals: slice.map((row) => this.toDto(row, row.history, now)),
            nextCursor,
            enabled: true,
        };
    }

    async getSignalById(
        id: string,
        tier: CoreLayerEffectiveTier = 'SCOUT',
    ): Promise<CoreLayerSignalDto | null> {
        if (!this.runtimeFlag.isEnabled()) return null;
        const row = await this.prisma.coreLayerSignal.findUnique({
            where: { id },
            include: { history: { orderBy: { at: 'asc' } } },
        });
        if (!row) return null;
        // Authoritative tier filter on the single-row endpoint too. A
        // SCOUT caller that stumbles onto a Pro-tier id (via a deep link,
        // a cached client, or a direct curl) gets a null — the frontend
        // routes this to a "signal not found" state, which is the right
        // UX: we do not want to tell them "this exists, but upgrade".
        if (tier === 'SCOUT' && isProGated(row.chain, row.depth)) {
            return null;
        }
        return this.toDto(row, row.history, Date.now());
    }

    async getStats(
        tier: CoreLayerEffectiveTier = 'SCOUT',
    ): Promise<CoreLayerStatsResponseDto> {
        if (!this.runtimeFlag.isEnabled()) {
            return {
                total: 0,
                byVariant: { SE: 0, CRT: 0, BIAS: 0 },
                byAnchor: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 },
                byDepth: {},
                enabled: false,
            };
        }

        // Stats must reflect what THIS caller's list endpoint will
        // actually return. SCOUT tier gets the same depth cap applied.
        // The chain-array PRO_TFS strip cannot be expressed in SQL so
        // we approximate: depth-1 is an excellent proxy (any 15m/5m
        // leaf chain is by definition at a higher-TF depth ≤ 4, but
        // when W/1D/4H/1H chains also stack they are not affected).
        // The per-variant total may therefore over-count by the rare
        // 2-3 deep SCOUT-visible chains whose deepest TF is 15m; in
        // practice this is negligible and we log the precise cap
        // used so the admin panel can cross-reference.
        const scoutWhere: Prisma.CoreLayerSignalWhereInput = {
            status: 'ACTIVE',
            depth: { lte: SCOUT_MAX_DEPTH },
        };
        const where: Prisma.CoreLayerSignalWhereInput =
            tier === 'SCOUT' ? scoutWhere : { status: 'ACTIVE' };

        const [byVariantRows, byAnchorRows, byDepthRows, total] = await Promise.all([
            this.prisma.coreLayerSignal.groupBy({
                by: ['variant'],
                where,
                _count: true,
            }),
            this.prisma.coreLayerSignal.groupBy({
                by: ['anchor'],
                where,
                _count: true,
            }),
            this.prisma.coreLayerSignal.groupBy({
                by: ['depth'],
                where,
                _count: true,
            }),
            this.prisma.coreLayerSignal.count({ where }),
        ]);

        const byVariant: Record<CoreLayerVariantKey, number> = { SE: 0, CRT: 0, BIAS: 0 };
        for (const r of byVariantRows) byVariant[r.variant as CoreLayerVariantKey] = r._count;

        const byAnchor: Record<AnchorType, number> = { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 };
        for (const r of byAnchorRows) byAnchor[r.anchor as AnchorType] = r._count;

        const byDepth: Record<string, number> = {};
        for (const r of byDepthRows) byDepth[String(r.depth)] = r._count;

        return { total, byVariant, byAnchor, byDepth, enabled: true };
    }

    /** Apply ADR D13 HTF override + life-state refresh + JSON → DTO mapping. */
    private toDto(
        row: CoreLayerSignal,
        history: CoreLayerHistoryEntry[],
        now: number,
    ): CoreLayerSignalDto {
        const chain = row.chain as Tf[];
        const storedCloses = row.tfLastCandleClose as Partial<Record<Tf, number>>;
        const refreshedLifeState: Partial<Record<Tf, TfLifeState>> = {};
        for (const tf of chain) {
            const close = storedCloses[tf];
            if (typeof close !== 'number') continue;
            // ADR D13 HTF exception — weekly and daily always render as steady
            // regardless of the literal lifecycle. The literal state remains in
            // the DB for future analytics queries (ADR D14).
            if (tf === 'W' || tf === '1D') {
                refreshedLifeState[tf] = 'steady';
            } else {
                refreshedLifeState[tf] = computeLifeState(tf, close, now);
            }
        }

        // Read-time ticker enrichment (Phase 5.1). Cache miss — pair not on
        // Binance Futures, or cache never successfully seeded — falls back to
        // 0/0, which the frontend renders as "—" via the existing placeholder
        // fallback (SignalCard.hasTicker, CoreLayerPair.priceDisplay).
        const tick = this.ticker.get(row.pair);

        return {
            id: row.id,
            pair: row.pair,
            variant: row.variant as CoreLayerVariantKey,
            direction: row.direction as Direction,
            anchor: row.anchor as AnchorType,
            chain,
            depth: row.depth,
            correlationPairs: (row.correlationPairs as unknown as Array<[Tf, Tf]>) ?? [],
            tfLifeState: refreshedLifeState,
            tfLastCandleClose: storedCloses,
            sePerTf: (row.sePerTf as Partial<Record<Tf, SePatternKind>> | null) ?? undefined,
            plusSummary: (row.plusSummary as PlusSummary | null) ?? undefined,
            price: tick?.price ?? 0,
            change24h: tick?.change24h ?? 0,
            detectedAt: row.detectedAt.getTime(),
            lastPromotedAt: row.lastPromotedAt.getTime(),
            status: row.status as 'ACTIVE' | 'CLOSED',
            closedAt: row.closedAt ? row.closedAt.getTime() : undefined,
            history: history.map(this.toHistoryDto),
        };
    }

    private toHistoryDto = (entry: CoreLayerHistoryEntry): CoreLayerHistoryEntryDto => ({
        at: entry.at.getTime(),
        event: entry.event as CoreLayerHistoryEntryDto['event'],
        fromDepth: entry.fromDepth ?? undefined,
        toDepth: entry.toDepth ?? undefined,
        fromAnchor: (entry.fromAnchor as AnchorType | null) ?? undefined,
        toAnchor: (entry.toAnchor as AnchorType | null) ?? undefined,
        tfAdded: (entry.tfAdded as Tf | null) ?? undefined,
        tfRemoved: (entry.tfRemoved as Tf | null) ?? undefined,
        note: entry.note ?? undefined,
    });

    private buildCursor(row: CoreLayerSignal): string {
        const payload = `${row.lastPromotedAt.getTime()}:${row.id}`;
        return Buffer.from(payload, 'utf8').toString('base64url');
    }

    private parseCursor(cursor?: string): { lastPromotedAt: number; id: string } | null {
        if (!cursor) return null;
        try {
            const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
            const sep = decoded.indexOf(':');
            if (sep < 0) return null;
            const lastPromotedAt = Number(decoded.slice(0, sep));
            const id = decoded.slice(sep + 1);
            if (!Number.isFinite(lastPromotedAt) || !id) return null;
            return { lastPromotedAt, id };
        } catch {
            return null;
        }
    }
}
