/**
 * SE Scanner v2 - Pure Runtime Logic (Spec v3 — 3 TP Levels)
 * 
 * This file implements the EXACT signal processing logic from the spec.
 * It's a pure function with no DB access, making it easy to unit test.
 * 
 * SPEC v3: TP1 (1:1.5 RR, close 50%) → TP2 (1:2 RR, close 25%) → TP3 (1:3 RR, close 25%)
 */

// ============================================================
// TYPES
// ============================================================

export type SeDirection = 'bullish' | 'bearish';
export type SeState = 'live' | 'closed';
export type SeResult = 'won' | 'lost' | null;
export type SeResultType = 'tp1' | 'tp2' | 'tp3_full' | 'sl' | 'candle_expiry' | null;

export type SePatternV2 =
    | 'REV_BULLISH'
    | 'REV_BEARISH'
    | 'REV_PLUS_BULLISH'
    | 'REV_PLUS_BEARISH'
    | 'RUN_BULLISH'
    | 'RUN_BEARISH'
    | 'RUN_PLUS_BULLISH'
    | 'RUN_PLUS_BEARISH';

/**
 * Runtime signal representation - the minimum fields needed for processing
 */
export interface SeRuntimeSignal {
    id: string;
    direction_v2: SeDirection;
    entry_price: number;
    sl_price: number;          // Original SL - NEVER changes
    current_sl_price: number;  // Starts at sl_price, moves to entry_price after TP1
    tp1_price: number;         // 1:1.5 RR
    tp2_price: number;         // 1:2 RR
    tp3_price: number;         // 1:3 RR
    state: SeState;
    tp1_hit: boolean;
    tp2_hit: boolean;
    tp3_hit: boolean;
    result_v2: SeResult;
    result_type: SeResultType;
    candle_count: number;
    max_candles: number;
    triggered_at: Date;
    closed_at_v2: Date | null;
    delete_at: Date | null;
}

/**
 * Result of processing a signal - contains only the changed fields
 */
export interface SeProcessResult {
    changed: boolean;
    // Updated fields (only present if changed)
    state?: SeState;
    tp1_hit?: boolean;
    tp2_hit?: boolean;
    tp3_hit?: boolean;
    current_sl_price?: number;
    result_v2?: SeResult;
    result_type?: SeResultType;
    candle_count?: number;
    closed_at_v2?: Date;
    delete_at?: Date;
}

export interface ProcessOptions {
    currentPrice: number;
    isCandleClose: boolean;
    now?: Date;
}

// ============================================================
// MAIN PROCESSING FUNCTION
// ============================================================

/**
 * Process a live SE signal according to the spec.
 * 
 * FUNCTION process_signal(signal, current_price, is_candle_close):
 * 
 * This is the ONLY logic that determines signal outcomes.
 * Run this check on every price update and on every candle close.
 * Process steps in the EXACT order shown. Stop as soon as a step closes the signal.
 * 
 * @param signal - The current signal state
 * @param options - Processing options (currentPrice, isCandleClose, now)
 * @returns SeProcessResult with changed=true if any state changed
 */
export function processSeSignal(
    signal: SeRuntimeSignal,
    options: ProcessOptions
): SeProcessResult {
    const { currentPrice, isCandleClose, now = new Date() } = options;
    const direction = signal.direction_v2;

    // Only process live signals
    if (signal.state !== 'live') {
        return { changed: false };
    }

    // Working copy of signal state
    let candle_count = signal.candle_count;
    let tp1_hit = signal.tp1_hit;
    let tp2_hit = signal.tp2_hit;
    let tp3_hit = signal.tp3_hit;
    let current_sl_price = signal.current_sl_price;

    // ============================================================
    // STEP 1: INCREMENT CANDLE COUNT (only on candle close events)
    // ============================================================
    if (isCandleClose) {
        candle_count = candle_count + 1;
    }

    // ============================================================
    // STEP 2: CHECK IF PRICE HIT CURRENT SL
    // ============================================================
    // IMPORTANT: If TP1 has NOT been hit yet, and BOTH SL and TP1 are breached
    // on the same update, skip SL and let TP1 handle it (Step 3).
    // This only applies to the original SL, not breakeven SL.

    let sl_breached = false;
    if (direction === 'bullish' && currentPrice <= current_sl_price) {
        sl_breached = true;
    } else if (direction === 'bearish' && currentPrice >= current_sl_price) {
        sl_breached = true;
    }

    if (sl_breached) {
        // Check if TP1 is ALSO breached on this same update
        let tp1_also_breached = false;
        if (!tp1_hit) {
            if (direction === 'bullish' && currentPrice >= signal.tp1_price) {
                tp1_also_breached = true;
            } else if (direction === 'bearish' && currentPrice <= signal.tp1_price) {
                tp1_also_breached = true;
            }
        }

        if (tp1_also_breached) {
            // → Skip SL. Go to HANDLE_TP1 (TP1 takes priority over original SL)
            // Fall through to Step 3
        } else {
            // → Go to CLOSE_SL
            return closeSl(signal, tp1_hit, tp2_hit, candle_count, now);
        }
    }

    // ============================================================
    // STEP 3: CHECK IF PRICE HIT TP1 (only if not already hit)
    // ============================================================
    if (!tp1_hit) {
        let tp1_reached = false;
        if (direction === 'bullish' && currentPrice >= signal.tp1_price) {
            tp1_reached = true;
        } else if (direction === 'bearish' && currentPrice <= signal.tp1_price) {
            tp1_reached = true;
        }

        if (tp1_reached) {
            // → Go to HANDLE_TP1
            return handleTp1(signal, currentPrice, candle_count, direction, now);
        }
    }

    // ============================================================
    // STEP 4: CHECK IF PRICE HIT TP2 (only if TP1 already hit, TP2 not yet)
    // ============================================================
    if (tp1_hit && !tp2_hit) {
        let tp2_reached = false;
        if (direction === 'bullish' && currentPrice >= signal.tp2_price) {
            tp2_reached = true;
        } else if (direction === 'bearish' && currentPrice <= signal.tp2_price) {
            tp2_reached = true;
        }

        if (tp2_reached) {
            // → Go to HANDLE_TP2 (signal stays live, tracking TP3)
            return handleTp2(signal, currentPrice, candle_count, direction, now);
        }
    }

    // ============================================================
    // STEP 5: CHECK IF PRICE HIT TP3 (only if TP2 hit, TP3 not yet)
    // ============================================================
    if (tp2_hit && !tp3_hit) {
        let tp3_reached = false;
        if (direction === 'bullish' && currentPrice >= signal.tp3_price) {
            tp3_reached = true;
        } else if (direction === 'bearish' && currentPrice <= signal.tp3_price) {
            tp3_reached = true;
        }

        if (tp3_reached) {
            // → Go to CLOSE_TP3
            return closeTp3(candle_count, now);
        }
    }

    // ============================================================
    // STEP 6: CHECK CANDLE EXPIRY (only on candle close events)
    // ============================================================
    if (isCandleClose && candle_count >= signal.max_candles) {
        // → Go to CLOSE_EXPIRY
        return closeExpiry(signal, currentPrice, tp1_hit, tp2_hit, candle_count, direction, now);
    }

    // No condition met. Signal is still live. No action.
    // But if candle_count changed, we need to return that
    if (candle_count !== signal.candle_count) {
        return {
            changed: true,
            candle_count,
        };
    }

    return { changed: false };
}

// ============================================================
// OUTCOME HANDLERS
// ============================================================

/**
 * CLOSE_SL:
 * IF signal.tp1_hit == true:
 *     // SL hit at breakeven AFTER TP1 — still a win
 *     IF signal.tp2_hit == true:
 *         signal.result_type = "tp2"
 *     ELSE:
 *         signal.result_type = "tp1"
 *     signal.result = "won"
 * ELSE:
 *     // SL hit before TP1 — loss
 *     signal.result = "lost"
 *     signal.result_type = "sl"
 */
function closeSl(
    signal: SeRuntimeSignal,
    tp1_hit: boolean,
    tp2_hit: boolean,
    candle_count: number,
    now: Date
): SeProcessResult {
    const delete_at = new Date(now.getTime() + 48 * 60 * 60 * 1000); // +48 hours

    if (tp1_hit) {
        // SL hit at breakeven AFTER TP1 — still a win
        return {
            changed: true,
            state: 'closed',
            result_v2: 'won',
            result_type: tp2_hit ? 'tp2' : 'tp1',
            candle_count,
            closed_at_v2: now,
            delete_at,
        };
    } else {
        // SL hit before TP1 — loss
        return {
            changed: true,
            state: 'closed',
            result_v2: 'lost',
            result_type: 'sl',
            candle_count,
            closed_at_v2: now,
            delete_at,
        };
    }
}

/**
 * HANDLE_TP1:
 * signal.tp1_hit = true
 * signal.current_sl_price = signal.entry_price   // move SL to breakeven
 * // DO NOT close the signal. 50% remains open (25% for TP2, 25% for TP3).
 * // CRITICAL: Check if price ALSO hit TP2 on this same update (gap scenario)
 */
function handleTp1(
    signal: SeRuntimeSignal,
    currentPrice: number,
    candle_count: number,
    direction: SeDirection,
    now: Date
): SeProcessResult {
    // Move SL to breakeven
    const new_current_sl_price = signal.entry_price;

    // CRITICAL: Check if price ALSO hit TP2 on this same update (gap scenario)
    let tp2_also_hit = false;
    if (direction === 'bullish' && currentPrice >= signal.tp2_price) {
        tp2_also_hit = true;
    } else if (direction === 'bearish' && currentPrice <= signal.tp2_price) {
        tp2_also_hit = true;
    }

    if (tp2_also_hit) {
        // → Go to HANDLE_TP2 (which may cascade to CLOSE_TP3)
        return handleTp2(signal, currentPrice, candle_count, direction, now);
    }

    // TP2 not hit yet. Signal stays live with updated state.
    return {
        changed: true,
        tp1_hit: true,
        current_sl_price: new_current_sl_price,
        candle_count,
    };
}

/**
 * HANDLE_TP2:
 * signal.tp1_hit = true    // ensure tp1 is marked (covers gap scenario)
 * signal.tp2_hit = true
 * // DO NOT close the signal. 25% remains open for TP3.
 * // CRITICAL: Check if price ALSO hit TP3 on this same update (gap scenario)
 */
function handleTp2(
    signal: SeRuntimeSignal,
    currentPrice: number,
    candle_count: number,
    direction: SeDirection,
    now: Date
): SeProcessResult {
    // CRITICAL: Check if price ALSO hit TP3 on this same update (gap scenario)
    let tp3_also_hit = false;
    if (direction === 'bullish' && currentPrice >= signal.tp3_price) {
        tp3_also_hit = true;
    } else if (direction === 'bearish' && currentPrice <= signal.tp3_price) {
        tp3_also_hit = true;
    }

    if (tp3_also_hit) {
        // → Go to CLOSE_TP3
        return closeTp3(candle_count, now);
    }

    // TP3 not hit yet. Signal stays live with TP1+TP2 marked.
    return {
        changed: true,
        tp1_hit: true,
        tp2_hit: true,
        current_sl_price: signal.entry_price, // ensure breakeven SL
        candle_count,
    };
}

/**
 * CLOSE_TP3:
 * signal.tp1_hit = true    // ensure all are marked (covers gap-through-all scenario)
 * signal.tp2_hit = true
 * signal.tp3_hit = true
 * signal.result = "won"
 * signal.result_type = "tp3_full"
 */
function closeTp3(candle_count: number, now: Date): SeProcessResult {
    const delete_at = new Date(now.getTime() + 48 * 60 * 60 * 1000); // +48 hours

    return {
        changed: true,
        state: 'closed',
        tp1_hit: true,
        tp2_hit: true,
        tp3_hit: true,
        result_v2: 'won',
        result_type: 'tp3_full',
        candle_count,
        closed_at_v2: now,
        delete_at,
    };
}

/**
 * CLOSE_EXPIRY:
 * IF signal.tp1_hit == true:
 *     // At least TP1 was hit — win is locked
 *     signal.result = "won"
 *     IF signal.tp2_hit == true:
 *         signal.result_type = "tp2"
 *     ELSE:
 *         signal.result_type = "tp1"
 * ELSE:
 *     // Neither TP1 nor SL was hit within candle limit
 *     IF direction == "bullish":
 *         IF current_price > signal.entry_price:
 *             signal.result = "won"
 *         ELSE:
 *             signal.result = "lost"
 *             // NOTE: price == entry_price is "lost"
 *     ELSE IF direction == "bearish":
 *         IF current_price < signal.entry_price:
 *             signal.result = "won"
 *         ELSE:
 *             signal.result = "lost"
 *             // NOTE: price == entry_price is "lost"
 *     signal.result_type = "candle_expiry"
 */
function closeExpiry(
    signal: SeRuntimeSignal,
    currentPrice: number,
    tp1_hit: boolean,
    tp2_hit: boolean,
    candle_count: number,
    direction: SeDirection,
    now: Date
): SeProcessResult {
    const delete_at = new Date(now.getTime() + 48 * 60 * 60 * 1000); // +48 hours

    if (tp1_hit) {
        // At least TP1 was hit — win is locked
        return {
            changed: true,
            state: 'closed',
            result_v2: 'won',
            result_type: tp2_hit ? 'tp2' : 'tp1',
            candle_count,
            closed_at_v2: now,
            delete_at,
        };
    } else {
        // Neither TP1 nor SL was hit within candle limit
        let result: SeResult;

        if (direction === 'bullish') {
            // Any close in favor of the signal direction (even a tiny move) = "won"
            // Equal to entry or against direction = "lost"
            result = currentPrice > signal.entry_price ? 'won' : 'lost';
        } else {
            // bearish
            result = currentPrice < signal.entry_price ? 'won' : 'lost';
        }

        return {
            changed: true,
            state: 'closed',
            result_v2: result,
            result_type: 'candle_expiry',
            candle_count,
            closed_at_v2: now,
            delete_at,
        };
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get max_candles based on timeframe per spec:
 * - 4h: 10 candles (~40 hours)
 * - 1d: 4 candles (4 days)
 * - 1w: 2 candles (2 weeks)
 */
export function getMaxCandlesForTimeframe(timeframe: string): number {
    switch (timeframe.toLowerCase()) {
        case '4h':
            return 10;
        case '1d':
            return 4;
        case '1w':
            return 2;
        default:
            return 10; // Default to 4h
    }
}

