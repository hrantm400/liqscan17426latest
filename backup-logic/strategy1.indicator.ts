/**
 * strategy1.indicator.ts — Strategy 1: 4H SE + 5M Break
 *
 * Logic Flow:
 *   1. Detect 4H SuperEngulfing (REV/RUN/PLUS, both directions)
 *   2. Mark 4H Candle B Close as Break Level
 *   3. Check session (London 08-12 UTC / NY 13-17 UTC)
 *   4. Wait for 5M candle body close above/below level
 *   5. Find last 5M swing for SL (3L/3R)
 *   6. Check SL distance (max 1%)
 *   7. Calculate TP1 (1:1) and TP2 (1:2)
 *   8. Return signal (first break only)
 *
 * Standalone — does NOT import shared detectSuperEngulfing.
 * Has its own inline SE detection to scan multiple candle pairs.
 */

import { CandleData } from './indicators';

// ============================================================
// TYPES
// ============================================================

export interface Strategy1Signal {
    direction: 'BUY' | 'SELL';
    price: number;            // Entry price (5M break candle close)
    time: number;             // Time of 5M break candle
    barIndex: number;
    /** 4H SE candle time — used for dedup in scanner */
    seTime: number;
    /** 4H SE pattern details */
    sePattern: string;        // REV | RUN | REV_PLUS | RUN_PLUS
    seDirection: string;      // BULLISH | BEARISH
    breakLevel: number;       // 4H Candle B Close
    /** Session info */
    session: 'LONDON' | 'NEW_YORK';
    /** Trade levels */
    stopLoss: number;
    tp1: number;              // 1:1 R:R
    tp2: number;              // 1:2 R:R
    riskPercent: number;      // SL distance as % of entry
    /** Description label */
    label: string;
}

// ============================================================
// SESSION DETECTION
// ============================================================

type SessionName = 'LONDON' | 'NEW_YORK' | 'ASIA' | 'OFF_SESSION';

/**
 * Determine which session a given UTC timestamp falls in.
 * London Kill Zone: 08:00 – 12:00 UTC
 * New York Kill Zone: 13:00 – 17:00 UTC
 */
function getSession(timestampMs: number): SessionName {
    const date = new Date(timestampMs);
    const utcHour = date.getUTCHours();

    if (utcHour >= 8 && utcHour < 12) return 'LONDON';
    if (utcHour >= 13 && utcHour < 17) return 'NEW_YORK';
    if (utcHour >= 0 && utcHour < 8) return 'ASIA';
    return 'OFF_SESSION';
}

function isValidSession(timestampMs: number): boolean {
    const session = getSession(timestampMs);
    return session === 'LONDON' || session === 'NEW_YORK';
}

// ============================================================
// 5M SWING DETECTION (3 Left / 3 Right pivot)
// ============================================================

/**
 * Find the last swing low before the given bar index.
 * A swing low requires the low to be lower than 3 bars on each side.
 */
function findLastSwingLow(candles: CandleData[], beforeIndex: number, leftBars = 3, rightBars = 3): { price: number; index: number } | null {
    for (let i = beforeIndex - rightBars; i >= leftBars; i--) {
        let isSwingLow = true;

        for (let j = 1; j <= leftBars; j++) {
            if (candles[i - j].low <= candles[i].low) {
                isSwingLow = false;
                break;
            }
        }
        if (!isSwingLow) continue;

        for (let j = 1; j <= rightBars; j++) {
            if (candles[i + j].low <= candles[i].low) {
                isSwingLow = false;
                break;
            }
        }

        if (isSwingLow) {
            return { price: candles[i].low, index: i };
        }
    }
    return null;
}

/**
 * Find the last swing high before the given bar index.
 * A swing high requires the high to be higher than 3 bars on each side.
 */
function findLastSwingHigh(candles: CandleData[], beforeIndex: number, leftBars = 3, rightBars = 3): { price: number; index: number } | null {
    for (let i = beforeIndex - rightBars; i >= leftBars; i--) {
        let isSwingHigh = true;

        for (let j = 1; j <= leftBars; j++) {
            if (candles[i - j].high >= candles[i].high) {
                isSwingHigh = false;
                break;
            }
        }
        if (!isSwingHigh) continue;

        for (let j = 1; j <= rightBars; j++) {
            if (candles[i + j].high >= candles[i].high) {
                isSwingHigh = false;
                break;
            }
        }

        if (isSwingHigh) {
            return { price: candles[i].high, index: i };
        }
    }
    return null;
}

// ============================================================
// 4H SUPER ENGULFING DETECTION (inline, scans last 12 pairs)
// ============================================================

interface SE4HResult {
    direction: 'BULLISH' | 'BEARISH';
    pattern: string;   // REV | RUN | REV_PLUS | RUN_PLUS
    breakLevel: number; // Candle B close
    time: number;       // Candle B open time
    barIndex: number;   // Index in 4H array
}

/**
 * Scan the last N closed 4H candle pairs for SuperEngulfing patterns.
 * Returns ALL found SEs (most recent first) so the caller can try each one.
 *
 * Detection rules (per user spec):
 *   BULLISH REV: A=Red, B=Green, B.Low < A.Low (sweep), B.Close > A.Open
 *   BULLISH RUN: A=Green, B=Green, B.Low < A.Low (sweep), B.Close > A.Close
 *   BEARISH REV: A=Green, B=Red, B.High > A.High (sweep), B.Close < A.Open
 *   BEARISH RUN: A=Red, B=Red, B.High > A.High (sweep), B.Close < A.Close
 *   PLUS variant: same rules + B.Close > A.High (bull) or B.Close < A.Low (bear)
 */
function detect4HSuperEngulfingAll(candles4H: CandleData[]): SE4HResult[] {
    const results: SE4HResult[] = [];
    if (candles4H.length < 3) return results;

    // Remove the currently forming candle (last one)
    const closed = candles4H.slice(0, -1);
    if (closed.length < 2) return results;

    // Scan the last 12 closed candle pairs (48 hours of 4H candles)
    const scanStart = Math.max(1, closed.length - 12);

    for (let i = closed.length - 1; i >= scanStart; i--) {
        const candleB = closed[i];      // Current candle
        const candleA = closed[i - 1];  // Previous candle

        const aBull = candleA.close > candleA.open;
        const aBear = candleA.close < candleA.open;
        const bBull = candleB.close > candleB.open;
        const bBear = candleB.close < candleB.open;

        const plusBullCond = candleB.close > candleA.high;
        const plusBearCond = candleB.close < candleA.low;

        let direction: 'BULLISH' | 'BEARISH' | null = null;
        let pattern: string | null = null;

        // BULLISH REV: A=Red, B=Green, B.Low < A.Low, B.Close > A.Open
        if (bBull && aBear && candleB.low < candleA.low && candleB.close > candleA.open) {
            direction = 'BULLISH';
            pattern = plusBullCond ? 'REV_PLUS' : 'REV';
        }
        // BULLISH RUN: A=Green, B=Green, B.Low < A.Low, B.Close > A.Close
        else if (bBull && aBull && candleB.low < candleA.low && candleB.close > candleA.close) {
            direction = 'BULLISH';
            pattern = plusBullCond ? 'RUN_PLUS' : 'RUN';
        }
        // BEARISH REV: A=Green, B=Red, B.High > A.High, B.Close < A.Open
        else if (bBear && aBull && candleB.high > candleA.high && candleB.close < candleA.open) {
            direction = 'BEARISH';
            pattern = plusBearCond ? 'REV_PLUS' : 'REV';
        }
        // BEARISH RUN: A=Red, B=Red, B.High > A.High, B.Close < A.Close
        else if (bBear && aBear && candleB.high > candleA.high && candleB.close < candleA.close) {
            direction = 'BEARISH';
            pattern = plusBearCond ? 'RUN_PLUS' : 'RUN';
        }

        if (direction && pattern) {
            results.push({
                direction,
                pattern,
                breakLevel: candleB.close,
                time: candleB.openTime,
                barIndex: i,
            });
        }
    }

    return results; // Most recent first (index goes from high to low)
}

// ============================================================
// MAIN STRATEGY CHECK
// ============================================================

/**
 * Check Strategy 1: 4H SE + 5M Break
 *
 * Scans all recent 4H SEs and tries each one against 5M candles.
 * Returns the FIRST valid signal found (most recent SE first).
 *
 * @param candles4H  4H candles (at least 15, including 1 forming)
 * @param candles5M  5M candles (at least 30, including 1 forming)
 * @returns Signal or null
 */
export function checkStrategy1(
    candles4H: CandleData[],
    candles5M: CandleData[],
): Strategy1Signal | null {
    // STEP 1: Detect ALL recent 4H SuperEngulfing patterns
    const allSEs = detect4HSuperEngulfingAll(candles4H);
    if (allSEs.length === 0) return null;

    // Remove forming 5M candle
    const closed5M = candles5M.slice(0, -1);
    if (closed5M.length < 10) return null;

    // Try each SE pattern (most recent first)
    for (const se of allSEs) {
        const result = tryBreakForSE(se, closed5M);
        if (result) return result;
    }

    return null;
}

/**
 * Try to find a valid 5M break for a given 4H SE pattern.
 */
function tryBreakForSE(se: SE4HResult, closed5M: CandleData[]): Strategy1Signal | null {
    const breakLevel = se.breakLevel;

    // Find 5M candles that formed AFTER the 4H SE candle
    let startIdx = -1;
    for (let i = 0; i < closed5M.length; i++) {
        if (closed5M[i].openTime >= se.time) {
            startIdx = i;
            break;
        }
    }
    if (startIdx < 0) return null;

    // STEP 4: Find FIRST 5M body close above/below break level
    let breakCandle: CandleData | null = null;
    let breakCandleIdx = -1;

    for (let i = startIdx; i < closed5M.length; i++) {
        const c = closed5M[i];

        if (se.direction === 'BULLISH' && c.close > breakLevel) {
            breakCandle = c;
            breakCandleIdx = i;
            break; // FIRST break only — no re-entry
        } else if (se.direction === 'BEARISH' && c.close < breakLevel) {
            breakCandle = c;
            breakCandleIdx = i;
            break; // FIRST break only — no re-entry
        }

        // INVALIDATION: price moved opposite direction significantly
        // For bullish: if price drops far below break level (>2% below)
        // For bearish: if price rallies far above break level (>2% above)
        if (se.direction === 'BULLISH') {
            const dropPct = (breakLevel - c.low) / breakLevel * 100;
            if (dropPct > 2) return null; // Setup failed — invalidated
        } else {
            const rallyPct = (c.high - breakLevel) / breakLevel * 100;
            if (rallyPct > 2) return null; // Setup failed — invalidated
        }
    }

    if (!breakCandle || breakCandleIdx < 0) return null;

    // STEP 3: Check session — the break must happen during London or NY
    if (!isValidSession(breakCandle.openTime)) return null;

    const session = getSession(breakCandle.openTime) as 'LONDON' | 'NEW_YORK';

    // STEP 5: Find last 5M swing for SL
    let stopLoss: number;

    if (se.direction === 'BULLISH') {
        const swing = findLastSwingLow(closed5M, breakCandleIdx);
        if (!swing) return null;
        stopLoss = swing.price;
    } else {
        const swing = findLastSwingHigh(closed5M, breakCandleIdx);
        if (!swing) return null;
        stopLoss = swing.price;
    }

    // STEP 6: Check SL distance (max 1%)
    const entry = breakCandle.close;
    const slDistance = Math.abs(entry - stopLoss);
    const riskPercent = (slDistance / entry) * 100;

    if (riskPercent > 1.0) return null; // SL too wide — discard

    // STEP 7: Calculate TP1 (1:1) and TP2 (1:2)
    let tp1: number;
    let tp2: number;

    if (se.direction === 'BULLISH') {
        tp1 = entry + slDistance;       // 1:1
        tp2 = entry + slDistance * 2;   // 1:2
    } else {
        tp1 = entry - slDistance;       // 1:1
        tp2 = entry - slDistance * 2;   // 1:2
    }

    // STEP 8: Build and return signal
    const dirLabel = se.direction === 'BULLISH' ? 'LONG 🟢' : 'SHORT 🔴';
    const label = `4H ${se.pattern} ${dirLabel} | Session: ${session} | Risk: ${riskPercent.toFixed(2)}%`;

    return {
        direction: se.direction === 'BULLISH' ? 'BUY' : 'SELL',
        price: entry,
        time: breakCandle.openTime,
        barIndex: breakCandleIdx,
        seTime: se.time,           // 4H SE candle time for dedup
        sePattern: se.pattern,
        seDirection: se.direction,
        breakLevel,
        session,
        stopLoss,
        tp1,
        tp2,
        riskPercent: Math.round(riskPercent * 100) / 100,
        label,
    };
}
