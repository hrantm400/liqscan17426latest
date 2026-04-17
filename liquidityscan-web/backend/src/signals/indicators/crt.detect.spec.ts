import type { CandleData } from './candle-types';
import { detectCRT } from './crt.detect';

function c(
    openTime: number,
    o: number,
    h: number,
    l: number,
    cl: number,
): CandleData {
    return { openTime: openTime, open: o, high: h, low: l, close: cl, volume: 1 };
}

describe('detectCRT', () => {
    it('returns null when fewer than 2 candles', () => {
        expect(detectCRT([c(1, 10, 11, 9, 10)])).toBeNull();
        expect(detectCRT([])).toBeNull();
    });

    it('detects bullish CRT: sweep low, body inside range, prev body larger', () => {
        const prev = c(1000, 100, 105, 98, 104);
        const curr = c(2000, 101, 102, 97.5, 101.5);
        const out = detectCRT([prev, curr]);
        expect(out).not.toBeNull();
        expect(out!.direction).toBe('BUY');
        expect(out!.sweptLevel).toBe(98);
        expect(out!.sweepExtreme).toBe(97.5);
        expect(out!.prevHigh).toBe(105);
        expect(out!.prevLow).toBe(98);
        expect(out!.price).toBe(101.5);
        expect(out!.time).toBe(2000);
        expect(out!.barIndex).toBe(1);
    });

    it('detects bearish CRT: sweep high, body inside range, prev body larger', () => {
        const prev = c(1000, 100, 108, 99, 101);
        const curr = c(2000, 104, 109, 103, 104.5);
        const out = detectCRT([prev, curr]);
        expect(out).not.toBeNull();
        expect(out!.direction).toBe('SELL');
        expect(out!.sweptLevel).toBe(108);
        expect(out!.sweepExtreme).toBe(109);
    });

    it('returns null when prev body is not larger than current (equal bodies)', () => {
        const prev = c(1000, 100, 120, 95, 110);
        const curr = c(2000, 105, 118, 94, 115);
        expect(Math.abs(prev.close - prev.open)).toBe(Math.abs(curr.close - curr.open));
        expect(detectCRT([prev, curr])).toBeNull();
    });

    it('returns null when body not strictly inside prev range (bull)', () => {
        const prev = c(1000, 100, 105, 98, 104);
        const curr = c(2000, 97, 102, 96, 101);
        expect(detectCRT([prev, curr])).toBeNull();
    });

    it('returns null when no wick break below prev low (bull)', () => {
        const prev = c(1000, 100, 105, 98, 104);
        const curr = c(2000, 101, 104, 99, 102);
        expect(detectCRT([prev, curr])).toBeNull();
    });

    it('returns null when both bull and bear patterns would fire (edge conflict)', () => {
        const prev = c(1000, 100, 110, 90, 105);
        const curr = c(2000, 100, 111, 89, 101);
        const bullBreak = curr.low < prev.low;
        const bearBreak = curr.high > prev.high;
        expect(bullBreak && bearBreak).toBe(true);
        const out = detectCRT([prev, curr]);
        expect(out).toBeNull();
    });
});
