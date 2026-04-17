// ============================================================
// indicators.js — All three TradingView indicators ported to JS
// ============================================================

/**
 * Calculate RSI (Relative Strength Index)
 * Uses RMA (Wilder's smoothing / SMMA) for consistency with TradingView
 * @param {number[]} closes - Array of close prices
 * @param {number} length - RSI period (default 14)
 * @returns {number[]} RSI values (same length as closes, first `length` values are NaN)
 */
function calculateRSI(closes, length = 14) {
    const rsi = new Array(closes.length).fill(NaN);
    if (closes.length < length + 1) return rsi;

    const gains = [];
    const losses = [];
    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }

    // First average: SMA
    let avgGain = 0, avgLoss = 0;
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

/**
 * Simple Moving Average
 */
function sma(data, length) {
    const result = new Array(data.length).fill(NaN);
    for (let i = length - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < length; j++) sum += data[i - j];
        result[i] = sum / length;
    }
    return result;
}

/**
 * Exponential Moving Average
 */
function ema(data, length) {
    const result = new Array(data.length).fill(NaN);
    const k = 2 / (length + 1);
    let started = false;
    for (let i = 0; i < data.length; i++) {
        if (isNaN(data[i])) continue;
        if (!started) {
            result[i] = data[i];
            started = true;
        } else {
            result[i] = data[i] * k + result[i - 1] * (1 - k);
        }
    }
    return result;
}

/**
 * RMA (Wilder's Smoothing / SMMA)
 */
function rma(data, length) {
    const result = new Array(data.length).fill(NaN);
    let sum = 0, count = 0;
    for (let i = 0; i < data.length; i++) {
        if (isNaN(data[i])) continue;
        count++;
        if (count <= length) {
            sum += data[i];
            if (count === length) result[i] = sum / length;
        } else {
            result[i] = (result[i - 1] * (length - 1) + data[i]) / length;
        }
    }
    return result;
}

/**
 * Weighted Moving Average
 */
function wma(data, length) {
    const result = new Array(data.length).fill(NaN);
    const denom = (length * (length + 1)) / 2;
    for (let i = length - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < length; j++) {
            sum += data[i - j] * (length - j);
        }
        result[i] = sum / denom;
    }
    return result;
}

/**
 * Calculate MA of given type
 */
function calculateMA(data, length, type = 'SMA') {
    switch (type) {
        case 'EMA': return ema(data, length);
        case 'SMMA (RMA)': return rma(data, length);
        case 'WMA': return wma(data, length);
        default: return sma(data, length);
    }
}

// ============================================================
// PIVOT DETECTION
// ============================================================

/**
 * Find pivot lows in data
 * A pivot low at bar i is confirmed when the value at bar i is the lowest 
 * in the window [i - lbL, i + lbR]
 * Returns array of booleans
 */
function findPivotLows(data, lbL = 5, lbR = 5) {
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

/**
 * Find pivot highs in data
 */
function findPivotHighs(data, lbL = 5, lbR = 5) {
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

/**
 * Check bullish divergences (pivot lows)
 */
function checkBullishDivergences(candles, rsi, lows, pivotLowPositions, config, signals) {
    const {
        rangeLower = 5,
        rangeUpper = 60,
        limitLower = 30,
        plotBull = true,
        plotHiddenBull = false
    } = config;

    for (let k = 1; k < pivotLowPositions.length; k++) {
        const curr = pivotLowPositions[k];
        const prev = pivotLowPositions[k - 1];
        const barsBetween = curr - prev;

        if (barsBetween < rangeLower || barsBetween > rangeUpper) continue;

        const oscCurr = rsi[curr];
        const oscPrev = rsi[prev];
        const priceCurr = lows[curr];
        const pricePrev = lows[prev];

        // Start filter: previous pivot must be in oversold zone
        const startIsOversold = oscPrev < limitLower;

        // Regular Bullish: price lower low, RSI higher low
        if (plotBull && priceCurr < pricePrev && oscCurr > oscPrev && startIsOversold) {
            signals.push({
                type: 'bullish_divergence',
                label: 'Bull Div',
                barIndex: curr,
                time: candles[curr].time,
                rsiValue: oscCurr,
                price: priceCurr,
                // Line coords for drawing
                line: {
                    startBar: prev, endBar: curr,
                    startRSI: oscPrev, endRSI: oscCurr,
                    startPrice: pricePrev, endPrice: priceCurr
                },
                color: '#00E676'
            });
        }

        // Hidden Bullish: price higher low, RSI lower low
        if (plotHiddenBull && priceCurr > pricePrev && oscCurr < oscPrev && startIsOversold) {
            signals.push({
                type: 'hidden_bullish_divergence',
                label: 'Hidden Bull',
                barIndex: curr,
                time: candles[curr].time,
                rsiValue: oscCurr,
                price: priceCurr,
                line: {
                    startBar: prev, endBar: curr,
                    startRSI: oscPrev, endRSI: oscCurr,
                    startPrice: pricePrev, endPrice: priceCurr
                },
                color: '#69F0AE',
                dashed: true
            });
        }
    }
}

/**
 * Check bearish divergences (pivot highs)
 */
function checkBearishDivergences(candles, rsi, highs, pivotHighPositions, config, signals) {
    const {
        rangeLower = 5,
        rangeUpper = 60,
        limitUpper = 70,
        plotBear = true,
        plotHiddenBear = false
    } = config;

    for (let k = 1; k < pivotHighPositions.length; k++) {
        const curr = pivotHighPositions[k];
        const prev = pivotHighPositions[k - 1];
        const barsBetween = curr - prev;

        if (barsBetween < rangeLower || barsBetween > rangeUpper) continue;

        const oscCurr = rsi[curr];
        const oscPrev = rsi[prev];
        const priceCurr = highs[curr];
        const pricePrev = highs[prev];

        // Start filter: previous pivot must be in overbought zone
        const startIsOverbought = oscPrev > limitUpper;

        // Regular Bearish: price higher high, RSI lower high
        if (plotBear && priceCurr > pricePrev && oscCurr < oscPrev && startIsOverbought) {
            signals.push({
                type: 'bearish_divergence',
                label: 'Bear Div',
                barIndex: curr,
                time: candles[curr].time,
                rsiValue: oscCurr,
                price: priceCurr,
                line: {
                    startBar: prev, endBar: curr,
                    startRSI: oscPrev, endRSI: oscCurr,
                    startPrice: pricePrev, endPrice: priceCurr
                },
                color: '#FF5252'
            });
        }

        // Hidden Bearish: price lower high, RSI higher high
        if (plotHiddenBear && priceCurr < pricePrev && oscCurr > oscPrev && startIsOverbought) {
            signals.push({
                type: 'hidden_bearish_divergence',
                label: 'Hidden Bear',
                barIndex: curr,
                time: candles[curr].time,
                rsiValue: oscCurr,
                price: priceCurr,
                line: {
                    startBar: prev, endBar: curr,
                    startRSI: oscPrev, endRSI: oscCurr,
                    startPrice: pricePrev, endPrice: priceCurr
                },
                color: '#FF8A80',
                dashed: true
            });
        }
    }
}

/**
 * Detect RSI Divergences
 * @param {Object[]} candles - Array of {time, open, high, low, close}
 * @param {Object} config - Configuration
 * @returns {Object} { rsi, rsiMA, signals }
 */
function detectRSIDivergence(candles, config = {}) {
    const {
        rsiLength = 14,
        maLength = 14,
        maType = 'SMA',
        lbL = 5,
        lbR = 5
    } = config;

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const rsi = calculateRSI(closes, rsiLength);
    const rsiMA = calculateMA(rsi, maLength, maType);

    // Find pivots on RSI
    const pivotLows = findPivotLows(rsi, lbL, lbR);
    const pivotHighs = findPivotHighs(rsi, lbL, lbR);

    const signals = [];

    // Track previous pivot positions for divergence comparison
    // In Pine Script, pivots are confirmed at bar_index - lbR when looking from bar_index
    // But since we detect them directly at the pivot bar, we just iterate

    // Collect all pivot low positions
    const pivotLowPositions = [];
    for (let i = 0; i < pivotLows.length; i++) {
        if (pivotLows[i]) pivotLowPositions.push(i);
    }

    // Collect all pivot high positions
    const pivotHighPositions = [];
    for (let i = 0; i < pivotHighs.length; i++) {
        if (pivotHighs[i]) pivotHighPositions.push(i);
    }

    checkBullishDivergences(candles, rsi, lows, pivotLowPositions, config, signals);

    checkBearishDivergences(candles, rsi, highs, pivotHighPositions, config, signals);

    return { rsi, rsiMA, signals };
}

// ============================================================
// 2. SUPERENGULFING: REV + RUN [Plus]
// ============================================================

/**
 * Helper to check for RUN (Continuation) pattern
 */
function checkRunPattern(curr, prev, i, currBull, currBear, prevBull, prevBear, plusBullCond, plusBearCond) {
    const signals = [];
    // Bullish RUN: Green → Green
    if (currBull && prevBull && curr.low < prev.low && curr.close > prev.close) {
        const isPlus = plusBullCond;
        signals.push({
            type: isPlus ? 'run_bull_plus' : 'run_bull',
            label: isPlus ? 'RUN+' : 'RUN',
            barIndex: i,
            time: curr.time,
            price: curr.low,
            position: 'belowBar',
            color: isPlus ? '#00E676' : 'rgba(76,175,80,0.6)',
            shape: 'arrowUp'
        });
    }
    // Bearish RUN: Red → Red
    if (currBear && prevBear && curr.high > prev.high && curr.close < prev.close) {
        const isPlus = plusBearCond;
        signals.push({
            type: isPlus ? 'run_bear_plus' : 'run_bear',
            label: isPlus ? 'RUN+' : 'RUN',
            barIndex: i,
            time: curr.time,
            price: curr.high,
            position: 'aboveBar',
            color: isPlus ? '#FF1744' : 'rgba(244,67,54,0.6)',
            shape: 'arrowDown'
        });
    }
    return signals;
}

/**
 * Helper to check for REV (Reversal) pattern
 */
function checkRevPattern(curr, prev, i, currBull, currBear, prevBull, prevBear, plusBullCond, plusBearCond) {
    const signals = [];
    // Bullish REV: Red → Green
    if (currBull && prevBear && curr.low < prev.low && curr.close > prev.open) {
        const isPlus = plusBullCond;
        signals.push({
            type: isPlus ? 'rev_bull_plus' : 'rev_bull',
            label: isPlus ? 'REV+' : 'REV',
            barIndex: i,
            time: curr.time,
            price: curr.low,
            position: 'belowBar',
            color: isPlus ? '#00FF00' : 'rgba(0,255,0,0.7)',
            shape: 'arrowUp'
        });
    }
    // Bearish REV: Green → Red
    if (currBear && prevBull && curr.high > prev.high && curr.close < prev.open) {
        const isPlus = plusBearCond;
        signals.push({
            type: isPlus ? 'rev_bear_plus' : 'rev_bear',
            label: isPlus ? 'REV+' : 'REV',
            barIndex: i,
            time: curr.time,
            price: curr.high,
            position: 'aboveBar',
            color: isPlus ? '#FF0000' : 'rgba(255,0,0,0.7)',
            shape: 'arrowDown'
        });
    }
    return signals;
}

/**
 * Detect SuperEngulfing patterns
 * @param {Object[]} candles - Array of {time, open, high, low, close}
 * @param {Object} config
 * @returns {Object[]} Array of signals
 */
function detectSuperEngulfing(candles, config = {}) {
    const { showRun = true, showRev = true } = config;
    const signals = [];

    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];

        const currBull = curr.close > curr.open;
        const currBear = curr.close < curr.open;
        const prevBull = prev.close > prev.open;
        const prevBear = prev.close < prev.open;

        // Plus conditions
        const plusBullCond = curr.close > prev.high;
        const plusBearCond = curr.close < prev.low;

        // --- RUN (Continuation) ---
        if (showRun) {
            signals.push(...checkRunPattern(curr, prev, i, currBull, currBear, prevBull, prevBear, plusBullCond, plusBearCond));
        }

        // --- REV (Reversal) ---
        if (showRev) {
            signals.push(...checkRevPattern(curr, prev, i, currBull, currBear, prevBull, prevBear, plusBullCond, plusBearCond));
        }
    }

    return signals;
}

// ============================================================
// 3. ICT BIAS (Dynamic Timeframe)
// ============================================================

/**
 * Detect ICT Bias
 * @param {Object[]} candles - Array of {time, open, high, low, close}
 * @returns {Object} { bias, prevHigh, prevLow, signals }
 */
function detectICTBias(candles) {
    const signals = [];

    if (candles.length < 3) {
        return { bias: 'Ranging', prevHigh: 0, prevLow: 0, signals };
    }

    // We calculate bias for each bar from index 2 onwards
    for (let i = 2; i < candles.length; i++) {
        const prevClose = candles[i - 1].close;
        const prevPrevHigh = candles[i - 2].high;
        const prevPrevLow = candles[i - 2].low;

        let bias = 'Ranging';
        if (prevClose < prevPrevLow) bias = 'Bearish';
        else if (prevClose > prevPrevHigh) bias = 'Bullish';

        signals.push({
            type: 'ict_bias',
            bias,
            barIndex: i,
            time: candles[i].time,
            prevHigh: candles[i - 1].high,
            prevLow: candles[i - 1].low
        });
    }

    // Current (latest) bias
    const latest = signals[signals.length - 1];
    return {
        bias: latest ? latest.bias : 'Ranging',
        prevHigh: latest ? latest.prevHigh : 0,
        prevLow: latest ? latest.prevLow : 0,
        signals
    };
}

// ============================================================
// EXPORT (global for browser use or CommonJS for testing)
// ============================================================
const exportsObj = {
    calculateRSI,
    calculateMA,
    findPivotLows,
    findPivotHighs,
    detectRSIDivergence,
    detectSuperEngulfing,
    detectICTBias
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
}
if (typeof window !== 'undefined') {
    window.Indicators = exportsObj;
}
