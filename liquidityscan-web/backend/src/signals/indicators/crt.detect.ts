import type { CandleData, CRTSignal } from './candle-types';

/**
 * Detect CRT (Candle Range Theory) — institutional liquidity grabs.
 * Wick sweeps prev candle's high/low, but body closes back inside range.
 * Only returns signal for the most recent closed candle pair.
 */
export function detectCRT(candles: CandleData[]): CRTSignal | null {
    if (candles.length < 2) return null;

    const i = candles.length - 1;
    const curr = candles[i];
    const prev = candles[i - 1];

    const prevHigh = prev.high;
    const prevLow = prev.low;
    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);

    const bullWickBreak = curr.low < prevLow;
    const bullBodyInside = curr.open > prevLow && curr.close > prevLow &&
        curr.open < prevHigh && curr.close < prevHigh;
    const bullCRT = bullWickBreak && bullBodyInside && prevBody > currBody;

    const bearWickBreak = curr.high > prevHigh;
    const bearBodyInside = curr.open < prevHigh && curr.close < prevHigh &&
        curr.open > prevLow && curr.close > prevLow;
    const bearCRT = bearWickBreak && bearBodyInside && prevBody > currBody;

    if (bullCRT && bearCRT) return null;

    if (bullCRT) {
        return {
            direction: 'BUY',
            barIndex: i,
            time: curr.openTime,
            price: curr.close,
            sweptLevel: prevLow,
            prevHigh,
            prevLow,
            sweepExtreme: curr.low,
        };
    }

    if (bearCRT) {
        return {
            direction: 'SELL',
            barIndex: i,
            time: curr.openTime,
            price: curr.close,
            sweptLevel: prevHigh,
            prevHigh,
            prevLow,
            sweepExtreme: curr.high,
        };
    }

    return null;
}
