import type { CandleData } from './candle-types';

export interface ThreeOBSignal {
    direction: 'BUY' | 'SELL';
    barIndex: number;
    time: number; // c0.openTime
    price: number; // c0.close — entry price
    lowestLow: number; // min(c0.low, c1.low, c2.low) — BUY instant fail trigger
    highestHigh: number; // max(c0.high, c1.high, c2.high) — SELL instant fail trigger
    c1High: number;
    c1Low: number;
    c2Open: number;
    c2Close: number;
    c1Open: number;
    c1Close: number;
    c0Open: number;
    c0Close: number;
}

export function detect3OB(candles: CandleData[]): ThreeOBSignal | null {
    if (candles.length < 3) return null;

    const i = candles.length - 1;
    const c0 = candles[i];
    const c1 = candles[i - 1];
    const c2 = candles[i - 2];

    const isBull = (c: CandleData) => c.close > c.open;
    const isBear = (c: CandleData) => c.close < c.open;

    const lowestLow = Math.min(c0.low, c1.low, c2.low);
    const highestHigh = Math.max(c0.high, c1.high, c2.high);

    const bullPattern = isBull(c2) && isBear(c1) && isBull(c0) && c0.close > c1.high;

    const bearPattern = isBear(c2) && isBull(c1) && isBear(c0) && c0.close < c1.low;

    if (!bullPattern && !bearPattern) return null;

    const direction: 'BUY' | 'SELL' = bullPattern ? 'BUY' : 'SELL';

    return {
        direction,
        barIndex: i,
        time: c0.openTime,
        price: c0.close,
        lowestLow,
        highestHigh,
        c1High: c1.high,
        c1Low: c1.low,
        c2Open: c2.open,
        c2Close: c2.close,
        c1Open: c1.open,
        c1Close: c1.close,
        c0Open: c0.open,
        c0Close: c0.close,
    };
}
