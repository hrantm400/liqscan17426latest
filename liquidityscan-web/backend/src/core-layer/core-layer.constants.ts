/**
 * Core-Layer — backend compile-time constants.
 *
 * These intentionally mirror the frontend Core-Layer constants
 * (frontend/src/core-layer/constants.ts) line-for-line. The Core-Layer DTO
 * shape is shared across the API boundary (ADR D10), so the two sides must
 * agree on TF taxonomy, candle durations, and correlation pairings.
 *
 * Sub-hour (15m / 5m) exists in the enum but is hidden until Phase 7 flips
 * the feature flag. No runtime check here — callers drive visibility via
 * config.
 */

/** Canonical Core-Layer TF taxonomy. Matches the frontend TF union type. */
export type Tf = 'W' | '1D' | '4H' | '1H' | '15m' | '5m';

export type Direction = 'BUY' | 'SELL';

export type AnchorType = 'WEEKLY' | 'DAILY' | 'FOURHOUR';

export type CoreLayerVariantKey = 'SE' | 'CRT' | 'BIAS';

export type TfLifeState = 'fresh' | 'breathing' | 'steady';

/** SE pattern taxonomy. */
export type SePatternKind = 'REV' | 'REV+' | 'RUN' | 'RUN+';

export type PlusSummary = 'all' | 'dominant' | 'none';

/** High-timeframe first, canonical order. */
export const TF_ORDER: readonly Tf[] = ['W', '1D', '4H', '1H', '15m', '5m'];

/** Candle duration in milliseconds. No DST — exchanges stream in UTC. */
export const TF_CANDLE_MS: Record<Tf, number> = {
    W: 7 * 24 * 60 * 60 * 1000,
    '1D': 24 * 60 * 60 * 1000,
    '4H': 4 * 60 * 60 * 1000,
    '1H': 60 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '5m': 5 * 60 * 1000,
};

/** High-correlation pairings. v1 surfaces only 1D+1H; sub-hour pairings ship in Phase 7. */
export const CORRELATION_PAIRS: ReadonlyArray<readonly [Tf, Tf]> = [
    ['1D', '1H'],
    ['4H', '15m'],
    ['1H', '5m'],
];

/** TFs visible in v1 UI. Detection is still gated per-TF by upstream scanner coverage. */
export const VISIBLE_TFS: readonly Tf[] = ['W', '1D', '4H', '1H'];

/** Normalize the legacy/binance TF string (e.g. "1w", "1h") that the SuperEngulfingSignal table uses
 *  to the canonical Core-Layer TF ("W", "1H"). Unknown inputs return null so callers can skip them. */
export function normalizeTimeframe(tf: string): Tf | null {
    switch (tf) {
        case '1w':
        case '1W':
        case 'W':
            return 'W';
        case '1d':
        case '1D':
            return '1D';
        case '4h':
        case '4H':
            return '4H';
        case '1h':
        case '1H':
            return '1H';
        case '15m':
            return '15m';
        case '5m':
            return '5m';
        default:
            return null;
    }
}

/**
 * Map a Core-Layer variant key to the SuperEngulfingSignal.strategyType value used by each
 * underlying scanner. The SE, CRT, BIAS scanners all write into the same `super_engulfing_signals`
 * table (despite the legacy name) and are discriminated by this column.
 */
export const VARIANT_STRATEGY_TYPE: Record<CoreLayerVariantKey, string> = {
    SE: 'SUPER_ENGULFING',
    CRT: 'CRT',
    BIAS: 'ICT_BIAS',
};

/**
 * The reverse lookup is handy for detection code that walks all live rows.
 */
export const STRATEGY_TYPE_TO_VARIANT: Record<string, CoreLayerVariantKey> = {
    SUPER_ENGULFING: 'SE',
    CRT: 'CRT',
    ICT_BIAS: 'BIAS',
};

/** signalType values we treat as live on SuperEngulfingSignal. */
export const LIVE_SIGNAL_STATUSES = ['PENDING', 'ACTIVE'] as const;
