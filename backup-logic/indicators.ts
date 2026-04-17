/**
 * indicators.ts — All three indicator detection algorithms ported from JS/Java
 * RSI Divergence, SuperEngulfing (REV/RUN/Plus), ICT Bias
 */

// ============================================================
// TYPES
// ============================================================

export interface CandleData {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface RSIDivergenceSignal {
    type: 'bullish_divergence' | 'bearish_divergence' | 'hidden_bullish_divergence' | 'hidden_bearish_divergence';
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
    // Advanced Tracking (legacy)
    entryZone: number;
    sl: number;
    tp1: number;
    tp2: number;
    // SE Scanner v2 fields (per new spec)
    pattern_v2: 'REV_BULLISH' | 'REV_BEARISH' | 'REV_PLUS_BULLISH' | 'REV_PLUS_BEARISH' | 'RUN_BULLISH' | 'RUN_BEARISH' | 'RUN_PLUS_BULLISH' | 'RUN_PLUS_BEARISH';
    direction_v2: 'bullish' | 'bearish';
    entry_price: number;
    sl_price: number;
    tp1_price: number;
    tp2_price: number;
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
    sweptLevel: number;        // prev candle's low (bull) or high (bear) that was swept
    prevHigh: number;          // previous candle full range
    prevLow: number;
    sweepExtreme: number;      // current candle's actual low (bull) or high (bear)
}

// ============================================================
// RSI CALCULATION
// ============================================================

/**
 * Calculate RSI using Wilder's smoothing (RMA) — matches TradingView
 */
export function calculateRSI(closes: number[], length = 14): number[] {
    const rsi = new Array(closes.length).fill(NaN);
    if (closes.length < length + 1) return rsi;

    const gains: number[] = [];
    const losses: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }

    // First average: SMA
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < length; i++) {
        avgGain += gains[i];
        avgLoss += losses[i];
    }
    avgGain /= length;
    avgLoss /= length;

    if (avgLoss === 0) rsi[length] = 100;
    else {
        const rs = avgGain / avgLoss;
        rsi[length] = 100 - 100 / (1 + rs);
    }

    // Subsequent: RMA (Wilder's smoothing)
    for (let i = length; i < gains.length; i++) {
        avgGain = (avgGain * (length - 1) + gains[i]) / length;
        avgLoss = (avgLoss * (length - 1) + losses[i]) / length;
        if (avgLoss === 0) rsi[i + 1] = 100;
        else {
            const rs = avgGain / avgLoss;
            rsi[i + 1] = 100 - 100 / (1 + rs);
        }
    }
    return rsi;
}

// ============================================================
// PIVOT DETECTION
// ============================================================

function findPivotLows(data: number[], lbL = 5, lbR = 5): boolean[] {
    const pivots = new Array(data.length).fill(false);
    for (let i = lbL; i < data.length - lbR; i++) {
        if (isNaN(data[i])) continue;
        let isPivot = true;
        for (let j = 1; j <= lbL; j++) {
            if (isNaN(data[i - j]) || data[i - j] <= data[i]) { isPivot = false; break; }
        }
        if (!isPivot) continue;
        for (let j = 1; j <= lbR; j++) {
            if (isNaN(data[i + j]) || data[i + j] <= data[i]) { isPivot = false; break; }
        }
        if (isPivot) pivots[i] = true;
    }
    return pivots;
}

function findPivotHighs(data: number[], lbL = 5, lbR = 5): boolean[] {
    const pivots = new Array(data.length).fill(false);
    for (let i = lbL; i < data.length - lbR; i++) {
        if (isNaN(data[i])) continue;
        let isPivot = true;
        for (let j = 1; j <= lbL; j++) {
            if (isNaN(data[i - j]) || data[i - j] >= data[i]) { isPivot = false; break; }
        }
        if (!isPivot) continue;
        for (let j = 1; j <= lbR; j++) {
            if (isNaN(data[i + j]) || data[i + j] >= data[i]) { isPivot = false; break; }
        }
        if (isPivot) pivots[i] = true;
    }
    return pivots;
}

// ============================================================
// 1. RSI DIVERGENCE DETECTION
// ============================================================

export interface RSIDivergenceConfig {
    rsiLength?: number;
    lbL?: number;
    lbR?: number;
    rangeLower?: number;
    rangeUpper?: number;
    limitUpper?: number;
    limitLower?: number;
}

/**
 * Detect RSI Divergences on candle data.
 * Returns only the most recent divergence signals (last 30 candles).
 */
export function detectRSIDivergence(
    candles: CandleData[],
    config: RSIDivergenceConfig = {},
): RSIDivergenceSignal[] {
    const {
        rsiLength = 14,
        lbL = 5,
        lbR = 5,
        rangeLower = 5,
        rangeUpper = 60,
        limitUpper = 70,
        limitLower = 30,
    } = config;

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    const rsi = calculateRSI(closes, rsiLength);

    // Find pivots on RSI
    const pivotLows = findPivotLows(rsi, lbL, lbR);
    const pivotHighs = findPivotHighs(rsi, lbL, lbR);

    const signals: RSIDivergenceSignal[] = [];

    // Collect pivot positions
    const pivotLowPositions: number[] = [];
    for (let i = 0; i < pivotLows.length; i++) {
        if (pivotLows[i]) pivotLowPositions.push(i);
    }

    const pivotHighPositions: number[] = [];
    for (let i = 0; i < pivotHighs.length; i++) {
        if (pivotHighs[i]) pivotHighPositions.push(i);
    }

    // Only check recent 30 candles
    const recentThreshold = candles.length - 30;

    // Check bullish divergences (pivot lows)
    for (let k = 1; k < pivotLowPositions.length; k++) {
        const curr = pivotLowPositions[k];
        const prev = pivotLowPositions[k - 1];
        if (curr < recentThreshold) continue;

        const barsBetween = curr - prev;
        if (barsBetween < rangeLower || barsBetween > rangeUpper) continue;

        const oscCurr = rsi[curr];
        const oscPrev = rsi[prev];
        const priceCurr = lows[curr];
        const pricePrev = lows[prev];

        const startIsOversold = oscPrev < limitLower;

        // Regular Bullish: price lower low, RSI higher low
        if (priceCurr < pricePrev && oscCurr > oscPrev && startIsOversold) {
            signals.push({
                type: 'bullish_divergence',
                barIndex: curr,
                time: candles[curr].openTime,
                rsiValue: oscCurr,
                price: priceCurr,
                prevBarIndex: prev,
                prevRsiValue: oscPrev,
                prevPrice: pricePrev,
            });
        }

        // Hidden Bullish: price higher low, RSI lower low
        if (priceCurr > pricePrev && oscCurr < oscPrev && startIsOversold) {
            signals.push({
                type: 'hidden_bullish_divergence',
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

    // Check bearish divergences (pivot highs)
    for (let k = 1; k < pivotHighPositions.length; k++) {
        const curr = pivotHighPositions[k];
        const prev = pivotHighPositions[k - 1];
        if (curr < recentThreshold) continue;

        const barsBetween = curr - prev;
        if (barsBetween < rangeLower || barsBetween > rangeUpper) continue;

        const oscCurr = rsi[curr];
        const oscPrev = rsi[prev];
        const priceCurr = highs[curr];
        const pricePrev = highs[prev];

        const startIsOverbought = oscPrev > limitUpper;

        // Regular Bearish: price higher high, RSI lower high
        if (priceCurr > pricePrev && oscCurr < oscPrev && startIsOverbought) {
            signals.push({
                type: 'bearish_divergence',
                barIndex: curr,
                time: candles[curr].openTime,
                rsiValue: oscCurr,
                price: priceCurr,
                prevBarIndex: prev,
                prevRsiValue: oscPrev,
                prevPrice: pricePrev,
            });
        }

        // Hidden Bearish: price lower high, RSI higher high
        if (priceCurr < pricePrev && oscCurr > oscPrev && startIsOverbought) {
            signals.push({
                type: 'hidden_bearish_divergence',
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

    return signals;
}

// ============================================================
// 2. SUPERENGULFING: REV + RUN [Plus]
// ============================================================

export function calculateATR(candles: CandleData[], period = 14): number {
    if (candles.length <= 1) return 0;

    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high;
        const l = candles[i].low;
        const pc = candles[i - 1].close;
        const trueRange = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        tr.push(trueRange);
    }

    if (tr.length < period) {
        return tr.reduce((a, b) => a + b, 0) / tr.length; // fallback
    }

    let atr = 0;
    for (let i = 0; i < period; i++) {
        atr += tr[i];
    }
    atr /= period;

    for (let i = period; i < tr.length; i++) {
        atr = (atr * (period - 1) + tr[i]) / period;
    }

    return atr;
}

/**
 * Detect SuperEngulfing patterns on the last N candles.
 * Only returns signals for the most recent candle pair.
 * 
 * SE SCANNER V2 SPEC - SL/TP Calculation:
 * - entry_price = se_candle.close
 * - candle_range = se_candle.high - se_candle.low (FULL range including wicks)
 * - buffer = candle_range * 0.1 (fixed 10%)
 * - Bullish: sl_price = se_candle.low - buffer
 * - Bearish: sl_price = se_candle.high + buffer
 * - risk = ABS(entry_price - sl_price)
 * - tp1_price = entry ± (risk * 2)  // 1:2 RR
 * - tp2_price = entry ± (risk * 3)  // 1:3 RR
 */
export function detectSuperEngulfing(candles: CandleData[]): SuperEngulfingSignal[] {
    const signals: SuperEngulfingSignal[] = [];
    if (candles.length < 2) return signals;

    // Only check the last candle pair (just-closed candle vs previous)
    const i = candles.length - 1;
    const curr = candles[i];  // This is the SE candle that completes the pattern
    const prev = candles[i - 1];

    const currBull = curr.close > curr.open;
    const currBear = curr.close < curr.open;
    const prevBull = prev.close > prev.open;
    const prevBear = prev.close < prev.open;

    const plusBullCond = curr.close > prev.high;
    const plusBearCond = curr.close < prev.low;

    const entry = curr.close;

    // SE SCANNER V2 SPEC: Use SE candle's own range for buffer calculation
    const candle_range = curr.high - curr.low;
    const buffer = candle_range * 0.1;

    // Helper to calculate targets per spec (using SE candle's high/low, NOT min/max of both candles)
    const getBullTargetsV2 = () => {
        const sl = curr.low - buffer;       // Spec: sl_price = se_candle.low - buffer
        const risk = entry - sl;             // Spec: risk = ABS(entry_price - sl_price)
        const tp1 = entry + (risk * 2);      // Spec: tp1_price = entry_price + (risk * 2)
        const tp2 = entry + (risk * 3);      // Spec: tp2_price = entry_price + (risk * 3)
        return { entry, sl, tp1, tp2 };
    };

    const getBearTargetsV2 = () => {
        const sl = curr.high + buffer;       // Spec: sl_price = se_candle.high + buffer
        const risk = sl - entry;             // Spec: risk = ABS(entry_price - sl_price)
        const tp1 = entry - (risk * 2);      // Spec: tp1_price = entry_price - (risk * 2)
        const tp2 = entry - (risk * 3);      // Spec: tp2_price = entry_price - (risk * 3)
        return { entry, sl, tp1, tp2 };
    };

    // --- RUN (Continuation): same color ---
    // Bullish RUN: Green → Green, wick below prev low, close above prev close
    if (currBull && prevBull && curr.low < prev.low && curr.close > prev.close) {
        const isPlus = plusBullCond;
        const targets = getBullTargetsV2();
        signals.push({
            type: isPlus ? 'run_bull_plus' : 'run_bull',
            barIndex: i,
            time: curr.openTime,
            price: entry,
            direction: 'BUY',
            pattern: isPlus ? 'RUN_PLUS' : 'RUN',
            // Legacy fields
            entryZone: entry,
            sl: targets.sl,
            tp1: targets.tp1,
            tp2: targets.tp2,
            // SE v2 fields per spec
            pattern_v2: isPlus ? 'RUN_PLUS_BULLISH' : 'RUN_BULLISH',
            direction_v2: 'bullish',
            entry_price: targets.entry,
            sl_price: targets.sl,
            tp1_price: targets.tp1,
            tp2_price: targets.tp2,
            candle_high: curr.high,
            candle_low: curr.low,
        });
    }

    // Bearish RUN: Red → Red, wick above prev high, close below prev close
    if (currBear && prevBear && curr.high > prev.high && curr.close < prev.close) {
        const isPlus = plusBearCond;
        const targets = getBearTargetsV2();
        signals.push({
            type: isPlus ? 'run_bear_plus' : 'run_bear',
            barIndex: i,
            time: curr.openTime,
            price: entry,
            direction: 'SELL',
            pattern: isPlus ? 'RUN_PLUS' : 'RUN',
            // Legacy fields
            entryZone: entry,
            sl: targets.sl,
            tp1: targets.tp1,
            tp2: targets.tp2,
            // SE v2 fields per spec
            pattern_v2: isPlus ? 'RUN_PLUS_BEARISH' : 'RUN_BEARISH',
            direction_v2: 'bearish',
            entry_price: targets.entry,
            sl_price: targets.sl,
            tp1_price: targets.tp1,
            tp2_price: targets.tp2,
            candle_high: curr.high,
            candle_low: curr.low,
        });
    }

    // --- REV (Reversal): opposite color ---
    // Bullish REV: Red → Green, wick below prev low, close above prev open
    if (currBull && prevBear && curr.low < prev.low && curr.close > prev.open) {
        const isPlus = plusBullCond;
        const targets = getBullTargetsV2();
        signals.push({
            type: isPlus ? 'rev_bull_plus' : 'rev_bull',
            barIndex: i,
            time: curr.openTime,
            price: entry,
            direction: 'BUY',
            pattern: isPlus ? 'REV_PLUS' : 'REV',
            // Legacy fields
            entryZone: entry,
            sl: targets.sl,
            tp1: targets.tp1,
            tp2: targets.tp2,
            // SE v2 fields per spec
            pattern_v2: isPlus ? 'REV_PLUS_BULLISH' : 'REV_BULLISH',
            direction_v2: 'bullish',
            entry_price: targets.entry,
            sl_price: targets.sl,
            tp1_price: targets.tp1,
            tp2_price: targets.tp2,
            candle_high: curr.high,
            candle_low: curr.low,
        });
    }

    // Bearish REV: Green → Red, wick above prev high, close below prev open
    if (currBear && prevBull && curr.high > prev.high && curr.close < prev.open) {
        const isPlus = plusBearCond;
        const targets = getBearTargetsV2();
        signals.push({
            type: isPlus ? 'rev_bear_plus' : 'rev_bear',
            barIndex: i,
            time: curr.openTime,
            price: entry,
            direction: 'SELL',
            pattern: isPlus ? 'REV_PLUS' : 'REV',
            // Legacy fields
            entryZone: entry,
            sl: targets.sl,
            tp1: targets.tp1,
            tp2: targets.tp2,
            // SE v2 fields per spec
            pattern_v2: isPlus ? 'REV_PLUS_BEARISH' : 'REV_BEARISH',
            direction_v2: 'bearish',
            entry_price: targets.entry,
            sl_price: targets.sl,
            tp1_price: targets.tp1,
            tp2_price: targets.tp2,
            candle_high: curr.high,
            candle_low: curr.low,
        });
    }

    return signals;
}

// ============================================================
// 3. ICT BIAS DETECTION
// ============================================================

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

// ============================================================
// 4. CRT (CANDLE RANGE THEORY) DETECTION
// ============================================================

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

    // Bullish CRT: wick breaks below prev low, body stays inside prev range
    const bullWickBreak = curr.low < prevLow;
    const bullBodyInside = curr.open > prevLow && curr.close > prevLow &&
        curr.open < prevHigh && curr.close < prevHigh;
    const bullCRT = bullWickBreak && bullBodyInside && prevBody > currBody;

    // Bearish CRT: wick breaks above prev high, body stays inside prev range
    const bearWickBreak = curr.high > prevHigh;
    const bearBodyInside = curr.open < prevHigh && curr.close < prevHigh &&
        curr.open > prevLow && curr.close > prevLow;
    const bearCRT = bearWickBreak && bearBodyInside && prevBody > currBody;

    // Conflict rule: if both trigger, discard
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
