import { Injectable } from '@nestjs/common';
import { CoreLayerSignal, CoreLayerHistoryEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    AnchorType,
    CoreLayerVariantKey,
    Direction,
    PlusSummary,
    SePatternKind,
    Tf,
    TfLifeState,
} from './core-layer.constants';
import { computeLifeState } from './core-layer.helpers';
import type {
    CoreLayerHistoryEntryDto,
    CoreLayerSignalDto,
    CoreLayerStatsResponseDto,
    ListCoreLayerSignalsResponseDto,
} from './dto/core-layer-signal.dto';
import { isCoreLayerEnabled } from './core-layer.feature-flag';

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
};

@Injectable()
export class CoreLayerQueryService {
    constructor(private readonly prisma: PrismaService) {}

    /** Public so the controller can short-circuit when the flag is off. */
    isEnabled(): boolean {
        return isCoreLayerEnabled;
    }

    async listSignals(filters: ListFilters): Promise<ListCoreLayerSignalsResponseDto> {
        if (!isCoreLayerEnabled) {
            return { signals: [], nextCursor: null, enabled: false };
        }

        const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
        const where: Prisma.CoreLayerSignalWhereInput = {
            status: filters.status ?? 'ACTIVE',
        };
        if (filters.variant) where.variant = filters.variant;
        if (filters.direction) where.direction = filters.direction;
        if (filters.anchor) where.anchor = filters.anchor;
        if (filters.pair) where.pair = filters.pair;

        const cursorArgs = this.parseCursor(filters.cursor);

        // Pull `limit + 1` rows to detect whether another page exists without a second round trip.
        const rows = await this.prisma.coreLayerSignal.findMany({
            where,
            orderBy: [{ lastPromotedAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
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

        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? this.buildCursor(slice[slice.length - 1]) : null;
        const now = Date.now();

        return {
            signals: slice.map((row) => this.toDto(row, row.history, now)),
            nextCursor,
            enabled: true,
        };
    }

    async getSignalById(id: string): Promise<CoreLayerSignalDto | null> {
        if (!isCoreLayerEnabled) return null;
        const row = await this.prisma.coreLayerSignal.findUnique({
            where: { id },
            include: { history: { orderBy: { at: 'asc' } } },
        });
        if (!row) return null;
        return this.toDto(row, row.history, Date.now());
    }

    async getStats(): Promise<CoreLayerStatsResponseDto> {
        if (!isCoreLayerEnabled) {
            return {
                total: 0,
                byVariant: { SE: 0, CRT: 0, BIAS: 0 },
                byAnchor: { WEEKLY: 0, DAILY: 0, FOURHOUR: 0 },
                byDepth: {},
                enabled: false,
            };
        }

        // Three groupBy calls. Indexed variant+status covers the first; the others are unindexed
        // but run against ACTIVE-only rows which stays small in practice (≤ single digits × 3 vars).
        const [byVariantRows, byAnchorRows, byDepthRows, total] = await Promise.all([
            this.prisma.coreLayerSignal.groupBy({
                by: ['variant'],
                where: { status: 'ACTIVE' },
                _count: true,
            }),
            this.prisma.coreLayerSignal.groupBy({
                by: ['anchor'],
                where: { status: 'ACTIVE' },
                _count: true,
            }),
            this.prisma.coreLayerSignal.groupBy({
                by: ['depth'],
                where: { status: 'ACTIVE' },
                _count: true,
            }),
            this.prisma.coreLayerSignal.count({ where: { status: 'ACTIVE' } }),
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
            // Phase 4 placeholders — ticker enrichment happens in Phase 5.
            price: 0,
            change24h: 0,
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
