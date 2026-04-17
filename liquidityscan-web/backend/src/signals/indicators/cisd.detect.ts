import type { CandleData, CISDSignal, CISD_MSS_TYPE } from './candle-types';

export interface CisdOptions {
    lbLeft: number;
    lbRight: number;
    minSeq: number;
}

/**
 * Candle open in America/New_York within [09:00, 14:00) — "NY 0900–1400" session window.
 */
function isNySession0900to1400(openTimeMs: number): boolean {
    const d = new Date(openTimeMs);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    }).formatToParts(d);
    let hour = 0;
    let minute = 0;
    for (const p of parts) {
        if (p.type === 'hour') hour = Number(p.value);
        if (p.type === 'minute') minute = Number(p.value);
    }
    const mins = hour * 60 + minute;
    return mins >= 9 * 60 && mins < 14 * 60;
}

function classifyMssType(openTimeMs: number): CISD_MSS_TYPE {
    if (isNySession0900to1400(openTimeMs)) return 'HIGH_PROB_MSS';
    return 'MSS';
}

function isPivotLow(candles: CandleData[], i: number, lbLeft: number, lbRight: number): boolean {
    if (i - lbLeft < 0 || i + lbRight >= candles.length) return false;
    const val = candles[i].low;
    for (let j = i - lbLeft; j <= i + lbRight; j++) {
        if (j !== i && candles[j].low <= val) return false;
    }
    return true;
}

function isPivotHigh(candles: CandleData[], i: number, lbLeft: number, lbRight: number): boolean {
    if (i - lbLeft < 0 || i + lbRight >= candles.length) return false;
    const val = candles[i].high;
    for (let j = i - lbLeft; j <= i + lbRight; j++) {
        if (j !== i && candles[j].high >= val) return false;
    }
    return true;
}

interface PendingSetup {
    direction: 'BUY' | 'SELL';
    mssLevel: number;
    fib50: number;
    pivotPrice: number;
    pivotBarIndex: number;
    revCandleTime: number;
    revCandleOpen: number;
    revCandleClose: number;
}



/**
 * CISD detector perfectly mirroring the TradingView Pine Script algorithm.
 * 1. Find explicit structural pivots (5-2 standard).
 * 2. Look back up to 50 bars for a reverse candle, followed by at least MIN_SEQ consecutive opposite-trend candles.
 * 3. Form an MSS Level from the body extreme of that specific reverse candle.
 * 4. Wait for breakout on later bars.
 * 5. Check High-Prob FVG at the breakout bar exactly.
 */
export function detectAllMSS(candles: CandleData[], options: CisdOptions): CISDSignal[] {
    const raw: CISDSignal[] = [];

    // State Tracking
    let pendingBull: PendingSetup | null = null;
    let pendingBear: PendingSetup | null = null;
    const { lbLeft, lbRight, minSeq } = options;

    // Loop through candles
    // Starts from lbLeft because we need past bars for the first pivot check
    for (let i = lbLeft; i < candles.length; i++) {
        // Pivot index (looking back right side)
        const p = i - lbRight;
        if (p < lbLeft) continue;

        // ==========================================
        // 1. BULLISH SETUP FORMATION (Long)
        // ==========================================
        if (p >= lbLeft && isPivotLow(candles, p, lbLeft, lbRight)) {
            const pivotPrice = candles[p].low;
            let foundBullRev = false;
            let revIdx = 0;

            for (let lookback = 1; lookback <= 50; lookback++) {
                const idx = p - lookback;
                if (idx < 0) break; // Array boundary safeguard

                // Is it a Green Candle?
                if (candles[idx].close > candles[idx].open) {
                    let validSeq = true;
                    // Require min_seq distance from Pivot
                    if (lookback < minSeq) {
                        validSeq = false;
                    } else {
                        // All candles strictly after the reverse candle (moving towards pivot) must be RED
                        // Pine Script: close >= open makes it invalid (meaning it must strictly be close < open)
                        for (let k = 1; k <= minSeq; k++) {
                            const forwardIdx = idx + k; // Moving 'k' steps forward in time
                            if (candles[forwardIdx].close >= candles[forwardIdx].open) {
                                validSeq = false;
                                break;
                            }
                        }
                    }

                    if (validSeq) {
                        foundBullRev = true;
                        revIdx = idx;
                        break;
                    }
                }
            }

            if (foundBullRev) {
                // Determine MSS body level (Pine Script: math.max(open, close))
                const mssBody = Math.max(candles[revIdx].open, candles[revIdx].close);
                const fib50 = (mssBody + pivotPrice) / 2;

                pendingBull = {
                    direction: 'BUY',
                    mssLevel: mssBody,
                    fib50: fib50,
                    pivotPrice: pivotPrice,
                    pivotBarIndex: p,
                    revCandleTime: candles[revIdx].openTime,
                    revCandleOpen: candles[revIdx].open,
                    revCandleClose: candles[revIdx].close,
                };
            }
        }

        // ==========================================
        // 2. BEARISH SETUP FORMATION (Short)
        // ==========================================
        if (p >= lbLeft && isPivotHigh(candles, p, lbLeft, lbRight)) {
            const pivotPrice = candles[p].high;
            let foundBearRev = false;
            let revIdx = 0;

            for (let lookback = 1; lookback <= 50; lookback++) {
                const idx = p - lookback;
                if (idx < 0) break;

                // Is it a Red Candle?
                if (candles[idx].close < candles[idx].open) {
                    let validSeq = true;
                    // Require min_seq distance from Pivot
                    if (lookback < minSeq) {
                        validSeq = false;
                    } else {
                        // All candles strictly after the reverse candle (moving towards pivot) must be GREEN
                        // Pine Script: close <= open makes it invalid
                        for (let k = 1; k <= minSeq; k++) {
                            const forwardIdx = idx + k;
                            if (candles[forwardIdx].close <= candles[forwardIdx].open) {
                                validSeq = false;
                                break;
                            }
                        }
                    }

                    if (validSeq) {
                        foundBearRev = true;
                        revIdx = idx;
                        break;
                    }
                }
            }

            if (foundBearRev) {
                // Determine MSS body level (Pine Script: math.min(open, close))
                const mssBody = Math.min(candles[revIdx].open, candles[revIdx].close);
                const fib50 = (mssBody + pivotPrice) / 2;

                pendingBear = {
                    direction: 'SELL',
                    mssLevel: mssBody,
                    fib50: fib50,
                    pivotPrice: pivotPrice,
                    pivotBarIndex: p,
                    revCandleTime: candles[revIdx].openTime,
                    revCandleOpen: candles[revIdx].open,
                    revCandleClose: candles[revIdx].close,
                };
            }
        }

        // ==========================================
        // 3. EXTENSION & BREAKOUT FVG LOGIC (Current Bar)
        // ==========================================

        // -- Bullish Logic --
        if (pendingBull !== null) {
            // Break UP (Close > MSS Level)
            if (candles[i].close > pendingBull.mssLevel) {
                // Breakout FVG check: current low > high[2 bars ago]
                let hasFvg = false;
                let fvgHigh = null;
                let fvgLow = null;
                let fvgStartTime = null;

                if (i >= 2 && candles[i].low > candles[i - 2].high) {
                    hasFvg = true;
                    fvgHigh = candles[i].low;
                    fvgLow = candles[i - 2].high;
                    fvgStartTime = candles[i - 2].openTime;
                }

                // Fire signal
                const mssType = classifyMssType(candles[i].openTime);
                const buffer = Math.abs(pendingBull.mssLevel - pendingBull.fib50) * 0.15;

                raw.push({
                    direction: 'BUY',
                    barIndex: i,
                    time: candles[i].openTime,
                    price: candles[i].close,
                    mssLevel: pendingBull.mssLevel,
                    fib50: pendingBull.fib50,
                    pivotPrice: pendingBull.pivotPrice,
                    pivotBarIndex: pendingBull.pivotBarIndex,
                    hasFvg,
                    fvgHigh,
                    fvgLow,
                    fvgStartTime,
                    proximityUpper: pendingBull.fib50 + buffer,
                    proximityLower: pendingBull.fib50 - buffer,
                    mssType,
                    revCandleTime: pendingBull.revCandleTime,
                    revCandleOpen: pendingBull.revCandleOpen,
                    revCandleClose: pendingBull.revCandleClose,
                });

                // Clear pending setup once fired correctly
                pendingBull = null;
            }
        }

        // -- Bearish Logic --
        if (pendingBear !== null) {
            // Break DOWN (Close < MSS Level)
            if (candles[i].close < pendingBear.mssLevel) {
                // Breakout FVG check: current high < low[2 bars ago]
                let hasFvg = false;
                let fvgHigh = null;
                let fvgLow = null;
                let fvgStartTime = null;

                if (i >= 2 && candles[i].high < candles[i - 2].low) {
                    hasFvg = true;
                    fvgHigh = candles[i - 2].low;
                    fvgLow = candles[i].high;
                    fvgStartTime = candles[i - 2].openTime;
                }

                // Fire signal
                const mssType = classifyMssType(candles[i].openTime);
                const buffer = Math.abs(pendingBear.fib50 - pendingBear.mssLevel) * 0.15;

                raw.push({
                    direction: 'SELL',
                    barIndex: i,
                    time: candles[i].openTime,
                    price: candles[i].close,
                    mssLevel: pendingBear.mssLevel,
                    fib50: pendingBear.fib50,
                    pivotPrice: pendingBear.pivotPrice,
                    pivotBarIndex: pendingBear.pivotBarIndex,
                    hasFvg,
                    fvgHigh,
                    fvgLow,
                    fvgStartTime,
                    proximityUpper: pendingBear.fib50 + buffer,
                    proximityLower: pendingBear.fib50 - buffer,
                    mssType,
                    revCandleTime: pendingBear.revCandleTime,
                    revCandleOpen: pendingBear.revCandleOpen,
                    revCandleClose: pendingBear.revCandleClose,
                });

                // Clear pending setup once fired correctly
                pendingBear = null;
            }
        }
    }

    return raw;
}

/**
 * Historical backwards compat function (returns all occurrences).
 */
export function detectAllCISDHistorical(candles: CandleData[], options: CisdOptions): CISDSignal[] {
    return detectAllMSS(candles, options);
}

/**
 * Scanner access function: returns strictly the latest MSS signal that just fired.
 */
export function detectCISD(candles: CandleData[], options: CisdOptions): CISDSignal | null {
    const all = detectAllMSS(candles, options);
    return all.length > 0 ? all[all.length - 1] : null;
}
