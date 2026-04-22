import type {
    AnchorType,
    CoreLayerVariantKey,
    Direction,
    PlusSummary,
    SePatternKind,
    Tf,
    TfLifeState,
} from '../core-layer.constants';

/**
 * Core-Layer API DTOs.
 *
 * These shapes deliberately match frontend/src/core-layer/types.ts
 * (CoreLayerSignal) line-for-line, per ADR D10. Any drift is a contract bug.
 *
 * `price` and `change24h` are enriched on the frontend from ticker endpoints
 * and are not stored on the DB row — the backend returns 0 placeholders here
 * so the type shape stays required and the frontend overlay is additive.
 *
 * All timestamps are ms-epoch numbers, not ISO strings (ADR D10).
 */

export interface CoreLayerHistoryEntryDto {
    at: number;
    event: 'created' | 'promoted' | 'demoted' | 'anchor_changed' | 'closed';
    fromDepth?: number;
    toDepth?: number;
    fromAnchor?: AnchorType;
    toAnchor?: AnchorType;
    tfAdded?: Tf;
    tfRemoved?: Tf;
    note?: string;
}

export interface CoreLayerSignalDto {
    id: string;
    pair: string;
    variant: CoreLayerVariantKey;
    direction: Direction;
    anchor: AnchorType;
    chain: Tf[];
    depth: number;
    correlationPairs: Array<[Tf, Tf]>;
    tfLifeState: Partial<Record<Tf, TfLifeState>>;
    tfLastCandleClose: Partial<Record<Tf, number>>;
    sePerTf?: Partial<Record<Tf, SePatternKind>>;
    plusSummary?: PlusSummary;
    price: number;
    change24h: number;
    detectedAt: number;
    lastPromotedAt: number;
    status: 'ACTIVE' | 'CLOSED';
    closedAt?: number;
    history: CoreLayerHistoryEntryDto[];
}

export interface ListCoreLayerSignalsResponseDto {
    signals: CoreLayerSignalDto[];
    nextCursor: string | null;
    enabled: boolean;
}

export interface CoreLayerStatsResponseDto {
    total: number;
    byVariant: Record<CoreLayerVariantKey, number>;
    byAnchor: Record<AnchorType, number>;
    byDepth: Record<string, number>;
    enabled: boolean;
}
