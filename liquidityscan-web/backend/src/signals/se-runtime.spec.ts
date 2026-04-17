/**
 * SE Scanner v2 - Unit Tests (Spec v3 — 3 TP Levels)
 * 
 * Tests all scenarios from the specification.
 * Each test validates the processSeSignal function against expected outcomes.
 * 
 * SPEC v3 TEST SETUP (bullish unless stated):
 * - se_candle.high = 100, se_candle.low = 90, se_candle.close = 95
 * - timeframe = "4h", max_candles = 10
 * - sl_price = 89, current_sl_price = 89
 * - risk = 6
 * - tp1_price = 104  (1:1.5 RR)
 * - tp2_price = 107  (1:2 RR)
 * - tp3_price = 113  (1:3 RR)
 */

import { processSeSignal, SeRuntimeSignal, SeDirection } from './se-runtime';

// Helper to create a test signal with default bullish setup per spec v3
function createTestSignal(overrides: Partial<SeRuntimeSignal> = {}): SeRuntimeSignal {
    const now = new Date();
    return {
        id: 'test-signal-1',
        direction_v2: 'bullish',
        entry_price: 95,
        sl_price: 89,          // se_candle.low (90) - buffer (1) = 89
        current_sl_price: 89,
        tp1_price: 104,        // entry (95) + risk (6) * 1.5 = 104
        tp2_price: 107,        // entry (95) + risk (6) * 2 = 107
        tp3_price: 113,        // entry (95) + risk (6) * 3 = 113
        state: 'live',
        tp1_hit: false,
        tp2_hit: false,
        tp3_hit: false,
        result_v2: null,
        result_type: null,
        candle_count: 0,
        max_candles: 10,
        triggered_at: now,
        closed_at_v2: null,
        delete_at: null,
        ...overrides,
    };
}

// Helper to create bearish signal per spec v3
function createBearishTestSignal(overrides: Partial<SeRuntimeSignal> = {}): SeRuntimeSignal {
    const now = new Date();
    return {
        id: 'test-signal-bearish',
        direction_v2: 'bearish',
        entry_price: 95,
        sl_price: 101,         // se_candle.high (100) + buffer (1) = 101
        current_sl_price: 101,
        tp1_price: 86,         // entry (95) - risk (6) * 1.5 = 86
        tp2_price: 83,         // entry (95) - risk (6) * 2 = 83
        tp3_price: 77,         // entry (95) - risk (6) * 3 = 77
        state: 'live',
        tp1_hit: false,
        tp2_hit: false,
        tp3_hit: false,
        result_v2: null,
        result_type: null,
        candle_count: 0,
        max_candles: 10,
        triggered_at: now,
        closed_at_v2: null,
        delete_at: null,
        ...overrides,
    };
}

describe('SE Scanner v3 - processSeSignal (3 TP levels)', () => {
    const testNow = new Date('2026-03-09T12:00:00Z');

    // ==========================================
    // TEST 1: SL hit before TP1
    // ==========================================
    describe('TEST 1: SL hit before TP1', () => {
        it('should close as LOST with result_type=sl when price drops to SL', () => {
            const signal = createTestSignal({ candle_count: 1 });

            const result = processSeSignal(signal, {
                currentPrice: 89,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('lost');
            expect(result.result_type).toBe('sl');
            expect(result.closed_at_v2).toBeDefined();
            expect(result.delete_at).toBeDefined();
        });
    });

    // ==========================================
    // TEST 2: TP1 hit only, then breakeven SL
    // ==========================================
    describe('TEST 2: TP1 hit only, then breakeven SL', () => {
        it('should set tp1_hit=true and move SL to breakeven when price reaches 104', () => {
            const signal = createTestSignal({ candle_count: 2 });

            const result = processSeSignal(signal, {
                currentPrice: 104,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.tp1_hit).toBe(true);
            expect(result.current_sl_price).toBe(95); // moved to entry
            expect(result.state).toBeUndefined(); // still live
        });

        it('should close as WON with result_type=tp1 when price hits breakeven SL after TP1', () => {
            const signal = createTestSignal({
                candle_count: 6,
                tp1_hit: true,
                current_sl_price: 95, // breakeven
            });

            const result = processSeSignal(signal, {
                currentPrice: 95,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('tp1');
        });
    });

    // ==========================================
    // TEST 3: TP1 + TP2 hit, then breakeven SL
    // ==========================================
    describe('TEST 3: TP1 + TP2 hit, then breakeven SL', () => {
        it('should mark tp2_hit=true when price reaches 107 after TP1', () => {
            const signal = createTestSignal({
                candle_count: 4,
                tp1_hit: true,
                current_sl_price: 95,
            });

            const result = processSeSignal(signal, {
                currentPrice: 107,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.tp1_hit).toBe(true);
            expect(result.tp2_hit).toBe(true);
            expect(result.state).toBeUndefined(); // still live, tracking TP3
        });

        it('should close as WON with result_type=tp2 when breakeven SL hit after TP2', () => {
            const signal = createTestSignal({
                candle_count: 7,
                tp1_hit: true,
                tp2_hit: true,
                current_sl_price: 95, // breakeven
            });

            const result = processSeSignal(signal, {
                currentPrice: 95,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('tp2');
        });
    });

    // ==========================================
    // TEST 4: Full TP — all three levels hit
    // ==========================================
    describe('TEST 4: Full TP — all three levels hit', () => {
        it('should close as WON with result_type=tp3_full when price reaches 113', () => {
            const signal = createTestSignal({
                candle_count: 7,
                tp1_hit: true,
                tp2_hit: true,
                current_sl_price: 95,
            });

            const result = processSeSignal(signal, {
                currentPrice: 113,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('tp3_full');
            expect(result.tp1_hit).toBe(true);
            expect(result.tp2_hit).toBe(true);
            expect(result.tp3_hit).toBe(true);
        });
    });

    // ==========================================
    // TEST 5: Candle expiry — in profit, no TP1 hit
    // ==========================================
    describe('TEST 5: Candle expiry — in profit, no TP1 hit', () => {
        it('should close as WON with result_type=candle_expiry when price is above entry at expiry', () => {
            const signal = createTestSignal({ candle_count: 9 });

            const result = processSeSignal(signal, {
                currentPrice: 98, // above entry (95)
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('candle_expiry');
        });
    });

    // ==========================================
    // TEST 6: Candle expiry — at loss, no TP1 hit
    // ==========================================
    describe('TEST 6: Candle expiry — at loss, no TP1 hit', () => {
        it('should close as LOST with result_type=candle_expiry when price is below entry at expiry', () => {
            const signal = createTestSignal({ candle_count: 9 });

            const result = processSeSignal(signal, {
                currentPrice: 92,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('lost');
            expect(result.result_type).toBe('candle_expiry');
        });
    });

    // ==========================================
    // TEST 7: Candle expiry — breakeven (price == entry)
    // ==========================================
    describe('TEST 7: Candle expiry — breakeven (price == entry)', () => {
        it('should close as LOST when price equals entry at expiry (per spec: price == entry is lost)', () => {
            const signal = createTestSignal({ candle_count: 9 });

            const result = processSeSignal(signal, {
                currentPrice: 95,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('lost');
            expect(result.result_type).toBe('candle_expiry');
        });
    });

    // ==========================================
    // TEST 8: TP1 hit, then candle expiry (TP2/TP3 never reached)
    // ==========================================
    describe('TEST 8: TP1 hit, then candle expiry', () => {
        it('should close as WON with result_type=tp1 when TP1 was hit earlier and expiry reached', () => {
            const signal = createTestSignal({
                candle_count: 9,
                tp1_hit: true,
                current_sl_price: 95,
            });

            const result = processSeSignal(signal, {
                currentPrice: 105, // never hit 95, 107, or 113
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('tp1');
        });
    });

    // ==========================================
    // TEST 9: TP1 + TP2 hit, then candle expiry (TP3 never reached)
    // ==========================================
    describe('TEST 9: TP1 + TP2 hit, then candle expiry', () => {
        it('should close as WON with result_type=tp2 when TP2 was highest reached', () => {
            const signal = createTestSignal({
                candle_count: 9,
                tp1_hit: true,
                tp2_hit: true,
                current_sl_price: 95,
            });

            const result = processSeSignal(signal, {
                currentPrice: 110, // never hit 95 or 113
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('tp2');
        });
    });

    // ==========================================
    // TEST 10: Price gaps past all three TPs on same candle
    // ==========================================
    describe('TEST 10: Price gaps past all three TPs', () => {
        it('should close as WON with result_type=tp3_full when price gaps past 104, 107, and 113', () => {
            const signal = createTestSignal({ candle_count: 1 });

            const result = processSeSignal(signal, {
                currentPrice: 120, // past all three TPs
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.tp1_hit).toBe(true);
            expect(result.tp2_hit).toBe(true);
            expect(result.tp3_hit).toBe(true);
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('tp3_full');
        });
    });

    // ==========================================
    // TEST 11: TP1 and original SL breached on same candle
    // ==========================================
    describe('TEST 11: TP1 and original SL breached on same candle', () => {
        it('should prioritize TP1 over SL and move SL to breakeven (signal stays live)', () => {
            const signal = createTestSignal({ candle_count: 3 });

            const result = processSeSignal(signal, {
                currentPrice: 104, // hits TP1
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.tp1_hit).toBe(true);
            expect(result.current_sl_price).toBe(95); // moved to breakeven
            expect(result.state).toBeUndefined(); // still live
        });
    });

    // ==========================================
    // TEST 12: Deletion after 48 hours
    // ==========================================
    describe('TEST 12: Deletion after 48 hours', () => {
        it('should set delete_at to closed_at + 48 hours when signal closes', () => {
            const signal = createTestSignal({ candle_count: 1 });
            const closedAt = new Date('2026-03-09T12:00:00Z');
            const expectedDeleteAt = new Date('2026-03-11T12:00:00Z'); // +48 hours

            const result = processSeSignal(signal, {
                currentPrice: 89, // hit SL
                isCandleClose: true,
                now: closedAt,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.closed_at_v2).toEqual(closedAt);
            expect(result.delete_at).toEqual(expectedDeleteAt);
        });
    });

    // ==========================================
    // TEST 13: BEARISH — full TP (all 3 levels)
    // ==========================================
    describe('TEST 13: BEARISH — full TP', () => {
        it('should move SL to breakeven when price drops to TP1 (86)', () => {
            const signal = createBearishTestSignal({ candle_count: 3 });

            const result = processSeSignal(signal, {
                currentPrice: 86,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.tp1_hit).toBe(true);
            expect(result.current_sl_price).toBe(95); // breakeven
            expect(result.state).toBeUndefined(); // still live
        });

        it('should mark tp2_hit when price drops to TP2 (83)', () => {
            const signal = createBearishTestSignal({
                candle_count: 5,
                tp1_hit: true,
                current_sl_price: 95,
            });

            const result = processSeSignal(signal, {
                currentPrice: 83,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.tp1_hit).toBe(true);
            expect(result.tp2_hit).toBe(true);
            expect(result.state).toBeUndefined(); // still live, tracking TP3
        });

        it('should close as WON with result_type=tp3_full when price drops to TP3 (77)', () => {
            const signal = createBearishTestSignal({
                candle_count: 7,
                tp1_hit: true,
                tp2_hit: true,
                current_sl_price: 95,
            });

            const result = processSeSignal(signal, {
                currentPrice: 77,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('tp3_full');
        });
    });

    // ==========================================
    // TEST 14: BEARISH — SL hit
    // ==========================================
    describe('TEST 14: BEARISH — SL hit', () => {
        it('should close as LOST when price rises to SL (101)', () => {
            const signal = createBearishTestSignal({ candle_count: 1 });

            const result = processSeSignal(signal, {
                currentPrice: 101,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('lost');
            expect(result.result_type).toBe('sl');
        });
    });

    // ==========================================
    // TEST 15: Multiple independent signals on same symbol + timeframe
    // ==========================================
    describe('TEST 15: Multiple independent signals', () => {
        it('should process signals independently - one closing does not affect other', () => {
            const signal1 = createTestSignal({
                id: 'test-rev-plus-bullish',
                candle_count: 1,
            });

            const signal2: SeRuntimeSignal = {
                id: 'test-rev-bearish',
                direction_v2: 'bearish',
                entry_price: 92,
                sl_price: 98,
                current_sl_price: 98,
                tp1_price: 83,
                tp2_price: 80,
                tp3_price: 74,
                state: 'live',
                tp1_hit: false,
                tp2_hit: false,
                tp3_hit: false,
                result_v2: null,
                result_type: null,
                candle_count: 1,
                max_candles: 10,
                triggered_at: testNow,
                closed_at_v2: null,
                delete_at: null,
            };

            // Price drops to 89
            const result1 = processSeSignal(signal1, {
                currentPrice: 89,
                isCandleClose: true,
                now: testNow,
            });

            const result2 = processSeSignal(signal2, {
                currentPrice: 89,
                isCandleClose: true,
                now: testNow,
            });

            expect(result1.state).toBe('closed');
            expect(result1.result_v2).toBe('lost');
            expect(result1.result_type).toBe('sl');

            expect(result2.state).toBeUndefined(); // still live
            expect(result2.candle_count).toBe(2);
        });
    });

    // ==========================================
    // TEST 16: TP2 hit, then SL at breakeven — result_type should be tp2
    // ==========================================
    describe('TEST 16: TP2 hit, then breakeven SL → result_type=tp2', () => {
        it('should report tp2 as highest TP reached when SL hits at breakeven after TP2', () => {
            const signal = createTestSignal({
                candle_count: 7,
                tp1_hit: true,
                tp2_hit: true,
                current_sl_price: 95,
            });

            const result = processSeSignal(signal, {
                currentPrice: 95,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.state).toBe('closed');
            expect(result.result_v2).toBe('won');
            expect(result.result_type).toBe('tp2');
        });
    });

    // ==========================================
    // Edge case: Already closed signal
    // ==========================================
    describe('Edge case: Already closed signal', () => {
        it('should return changed=false for already closed signals', () => {
            const signal = createTestSignal({
                state: 'closed',
                result_v2: 'won',
                result_type: 'tp3_full',
            });

            const result = processSeSignal(signal, {
                currentPrice: 89,
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(false);
        });
    });

    // ==========================================
    // Edge case: Candle count increment without other changes
    // ==========================================
    describe('Edge case: Candle count increment', () => {
        it('should increment candle_count on candle close without hitting any level', () => {
            const signal = createTestSignal({ candle_count: 5 });

            const result = processSeSignal(signal, {
                currentPrice: 96, // between entry and TP1, above SL
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.candle_count).toBe(6);
            expect(result.state).toBeUndefined(); // still live
        });

        it('should not increment candle_count when isCandleClose=false', () => {
            const signal = createTestSignal({ candle_count: 5 });

            const result = processSeSignal(signal, {
                currentPrice: 96,
                isCandleClose: false,
                now: testNow,
            });

            expect(result.changed).toBe(false);
        });
    });

    // ==========================================
    // Edge case: Gap past TP1+TP2 but not TP3
    // ==========================================
    describe('Edge case: Gap past TP1 and TP2 but not TP3', () => {
        it('should mark tp1 and tp2 as hit, stay live tracking TP3', () => {
            const signal = createTestSignal({ candle_count: 2 });

            const result = processSeSignal(signal, {
                currentPrice: 110, // past 104 and 107 but not 113
                isCandleClose: true,
                now: testNow,
            });

            expect(result.changed).toBe(true);
            expect(result.tp1_hit).toBe(true);
            expect(result.tp2_hit).toBe(true);
            expect(result.state).toBeUndefined(); // still live, tracking TP3
            expect(result.current_sl_price).toBe(95); // breakeven
        });
    });
});
