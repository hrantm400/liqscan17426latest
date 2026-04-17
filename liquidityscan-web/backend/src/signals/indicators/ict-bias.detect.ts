import type { CandleData, ICTBiasSignal } from './candle-types';

/**
 * Detect ICT Daily Bias.
 * Compares previous close to day-before-yesterday high/low.
 * Only returns the latest bias signal.
 */
export function detectICTBias(candles: CandleData[]): ICTBiasSignal | null {
    if (candles.length < 3) return null;

    const i = candles.length - 1;
    const prevClose = candles[i - 1].close;
    const prevPrevHigh = candles[i - 2].high;
    const prevPrevLow = candles[i - 2].low;

    let bias: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';

    if (prevClose < prevPrevLow) {
        bias = 'BEARISH';
        direction = 'SELL';
    } else if (prevClose > prevPrevHigh) {
        bias = 'BULLISH';
        direction = 'BUY';
    }

    return {
        bias,
        barIndex: i - 1,
        time: candles[i - 1].openTime,
        prevHigh: candles[i - 1].high,
        prevLow: candles[i - 1].low,
        direction,
    };
}
