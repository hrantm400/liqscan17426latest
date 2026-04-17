/**
 * Shared candle and signal shape types for indicator detectors.
 */

export interface CandleData {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface RSIDivergenceSignal {
    type: 'bullish-divergence' | 'bearish-divergence';
    barIndex: number;
    time: number;
    rsiValue: number;
    price: number;
    prevBarIndex: number;
    prevRsiValue: number;
    prevPrice: number;
}

export interface SuperEngulfingSignal {
    type: 'run_bull' | 'run_bear' | 'run_bull_plus' | 'run_bear_plus' | 'rev_bull' | 'rev_bear' | 'rev_bull_plus' | 'rev_bear_plus';
    barIndex: number;
    time: number;
    price: number;
    direction: 'BUY' | 'SELL';
    pattern: 'RUN' | 'RUN_PLUS' | 'REV' | 'REV_PLUS';
    entryZone: number;
    sl: number;
    tp1: number;
    tp2: number;
    pattern_v2: 'REV_BULLISH' | 'REV_BEARISH' | 'REV_PLUS_BULLISH' | 'REV_PLUS_BEARISH' | 'RUN_BULLISH' | 'RUN_BEARISH' | 'RUN_PLUS_BULLISH' | 'RUN_PLUS_BEARISH';
    direction_v2: 'bullish' | 'bearish';
    entry_price: number;
    sl_price: number;
    tp1_price: number;
    tp2_price: number;
    tp3_price: number;
    candle_high: number;
    candle_low: number;
}

export interface ICTBiasSignal {
    bias: 'BULLISH' | 'BEARISH' | 'RANGING';
    barIndex: number;
    time: number;
    prevHigh: number;
    prevLow: number;
    direction: 'BUY' | 'SELL' | 'NEUTRAL';
}

export interface CRTSignal {
    direction: 'BUY' | 'SELL';
    barIndex: number;
    time: number;
    price: number;
    sweptLevel: number;
    prevHigh: number;
    prevLow: number;
    sweepExtreme: number;
}

export interface RSIDivergenceConfig {
    rsiLength?: number;
    lbL?: number;
    lbR?: number;
    rangeLower?: number;
    rangeUpper?: number;
    limitUpper?: number;
    limitLower?: number;
}

/** MSS flavor (TradingView-style labels). */
export type CISD_MSS_TYPE = 'MSS' | 'HIGH_PROB_MSS' | 'TRAP_MSS';

/** CISD / MSS detector output (scanner persists rows; lifecycle expires CISD after candle window). */
export interface CISDSignal {
    direction: 'BUY' | 'SELL';
    mssType: CISD_MSS_TYPE;
    barIndex: number;
    time: number;
    price: number;
    /** Swing level that was broken (pivot high for bull MSS, pivot low for bear MSS). */
    mssLevel: number;
    fib50: number;
    /** Opposite swing used for Fib50 (pivot low before broken high, or pivot high before broken low). */
    pivotPrice: number;
    /** Bar index of `pivotPrice` in the same candle array. */
    pivotBarIndex: number;
    hasFvg: boolean;
    fvgHigh: number | null;
    fvgLow: number | null;
    fvgStartTime: number | null;
    proximityUpper: number;
    proximityLower: number;
    revCandleTime: number;
    revCandleOpen: number;
    revCandleClose: number;
}
