import type { CandleData, RSIDivergenceConfig, RSIDivergenceSignal } from './candle-types';
import { calculateRSI } from './rsi-math';

/**
 * Pivot lows on the RSI series. Defaults: lbL = 5, lbR = 1.
 */
function findPivotLows(data: number[], lbL = 5, lbR = 1): boolean[] {
    const pivots = new Array(data.length).fill(false);
    for (let i = lbL; i < data.length - lbR; i++) {
        if (isNaN(data[i])) continue;
        let isPivot = true;
        for (let j = 1; j <= lbL; j++) {
            if (isNaN(data[i - j]) || data[i - j] <= data[i]) {
                isPivot = false;
                break;
            }
        }
        if (!isPivot) continue;
        for (let j = 1; j <= lbR; j++) {
            if (isNaN(data[i + j]) || data[i + j] <= data[i]) {
                isPivot = false;
                break;
            }
        }
        if (isPivot) pivots[i] = true;
    }
    return pivots;
}

/**
 * Pivot highs on the RSI series. Defaults: lbL = 5, lbR = 1.
 */
function findPivotHighs(data: number[], lbL = 5, lbR = 1): boolean[] {
    const pivots = new Array(data.length).fill(false);
    for (let i = lbL; i < data.length - lbR; i++) {
        if (isNaN(data[i])) continue;
        let isPivot = true;
        for (let j = 1; j <= lbL; j++) {
            if (isNaN(data[i - j]) || data[i - j] >= data[i]) {
                isPivot = false;
                break;
            }
        }
        if (!isPivot) continue;
        for (let j = 1; j <= lbR; j++) {
            if (isNaN(data[i + j]) || data[i + j] >= data[i]) {
                isPivot = false;
                break;
            }
        }
        if (isPivot) pivots[i] = true;
    }
    return pivots;
}

/**
 * RSI via Wilder's RMA (see `calculateRSI`), pivots on RSI, regular bull/bear divergence only.
 * Emits at most one bullish and/or one bearish signal: only the last confirmed pivot vs its immediate prior pivot.
 */
export function detectRSIDivergence(
    candles: CandleData[],
    config: RSIDivergenceConfig = {},
): RSIDivergenceSignal[] {
    const {
        rsiLength = 14,
        lbL = 5,
        lbR = 1,
        rangeLower = 5,
        rangeUpper = 60,
        limitUpper = 70,
        limitLower = 30,
    } = config;

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    const rsi = calculateRSI(closes, rsiLength);

    const pivotLows = findPivotLows(rsi, lbL, lbR);
    const pivotHighs = findPivotHighs(rsi, lbL, lbR);

    const pivotLowPositions: number[] = [];
    for (let i = 0; i < pivotLows.length; i++) {
        if (pivotLows[i]) pivotLowPositions.push(i);
    }

    const pivotHighPositions: number[] = [];
    for (let i = 0; i < pivotHighs.length; i++) {
        if (pivotHighs[i]) pivotHighPositions.push(i);
    }

    const signals: RSIDivergenceSignal[] = [];

    if (pivotLowPositions.length >= 2) {
        const k = pivotLowPositions.length - 1;
        const curr = pivotLowPositions[k];
        const prev = pivotLowPositions[k - 1];
        const barsBetween = curr - prev;
        if (barsBetween >= rangeLower && barsBetween <= rangeUpper) {
            const oscCurr = rsi[curr];
            const oscPrev = rsi[prev];
            const priceCurr = lows[curr];
            const pricePrev = lows[prev];
            if (priceCurr < pricePrev && oscCurr > oscPrev && oscPrev < limitLower) {
                signals.push({
                    type: 'bullish-divergence',
                    barIndex: curr,
                    time: candles[curr].openTime,
                    rsiValue: oscCurr,
                    price: priceCurr,
                    prevBarIndex: prev,
                    prevRsiValue: oscPrev,
                    prevPrice: pricePrev,
                });
            }
        }
    }

    if (pivotHighPositions.length >= 2) {
        const k = pivotHighPositions.length - 1;
        const curr = pivotHighPositions[k];
        const prev = pivotHighPositions[k - 1];
        const barsBetween = curr - prev;
        if (barsBetween >= rangeLower && barsBetween <= rangeUpper) {
            const oscCurr = rsi[curr];
            const oscPrev = rsi[prev];
            const priceCurr = highs[curr];
            const pricePrev = highs[prev];
            if (priceCurr > pricePrev && oscCurr < oscPrev && oscPrev > limitUpper) {
                signals.push({
                    type: 'bearish-divergence',
                    barIndex: curr,
                    time: candles[curr].openTime,
                    rsiValue: oscCurr,
                    price: priceCurr,
                    prevBarIndex: prev,
                    prevRsiValue: oscPrev,
                    prevPrice: pricePrev,
                });
            }
        }
    }

    return signals;
}
