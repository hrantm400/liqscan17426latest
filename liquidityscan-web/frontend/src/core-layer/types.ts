/**
 * Core-Layer — shared TypeScript types.
 *
 * These types are the single source of truth for Core-Layer data shape on the
 * frontend. In Phase 5 the backend DTOs are wired up to match this shape (see
 * ADR D10 for the signal identity contract and D13 for life-state derivation).
 *
 * Phase 1 is mock-only; nothing here imports from `services/` or fetches data.
 */

export type TF = 'W' | '1D' | '4H' | '1H' | '15m' | '5m';

export type Direction = 'BUY' | 'SELL';

export type AnchorType = 'WEEKLY' | 'DAILY' | 'FOURHOUR';

export type CoreLayerVariant = 'SE' | 'CRT' | 'BIAS';

export type TFLifeState = 'fresh' | 'breathing' | 'steady';

/**
 * SE pattern taxonomy (REV/RUN, with or without the Plus qualifier).
 * Per spec: `REV / REV+ / RUN / RUN+ per direction`.
 */
export type SePatternKind = 'REV' | 'REV+' | 'RUN' | 'RUN+';

/**
 * Aggregate Plus classification for an entire SE chain.
 * - `all`:      every TF in the chain is a Plus variant.
 * - `dominant`: majority of TFs in the chain are Plus variants.
 * - `none`:     zero or minority Plus variants.
 */
export type PlusSummary = 'all' | 'dominant' | 'none';

export type CoreLayerStatus = 'ACTIVE' | 'CLOSED';

export interface CoreLayerHistoryEntry {
  at: number;
  event: 'created' | 'promoted' | 'demoted' | 'anchor_changed' | 'closed';
  fromDepth?: number;
  toDepth?: number;
  fromAnchor?: AnchorType;
  toAnchor?: AnchorType;
  tfAdded?: TF;
  tfRemoved?: TF;
  note?: string;
}

/**
 * Canonical Core-Layer signal shape shared by mock data and (eventually)
 * Phase 5 backend responses.
 *
 * `price` and `change24h` are enriched on the frontend from ticker endpoints;
 * they are NOT columns on the backend `CoreLayerSignal` Prisma model. In mock
 * data they are hand-authored so UI components can render without a live feed.
 */
export interface CoreLayerSignal {
  id: string;
  pair: string;
  variant: CoreLayerVariant;
  direction: Direction;
  anchor: AnchorType;
  chain: TF[];
  depth: number;
  correlationPairs: Array<[TF, TF]>;
  tfLifeState: Partial<Record<TF, TFLifeState>>;
  tfLastCandleClose: Partial<Record<TF, number>>;
  sePerTf?: Partial<Record<TF, SePatternKind>>;
  plusSummary?: PlusSummary;
  price: number;
  change24h: number;
  detectedAt: number;
  lastPromotedAt: number;
  status: CoreLayerStatus;
  closedAt?: number;
  history: CoreLayerHistoryEntry[];
}
