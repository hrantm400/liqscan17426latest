import type { CandleData, SuperEngulfingSignal } from './candle-types';

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
        return tr.reduce((a, b) => a + b, 0) / tr.length;
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

function checkRunPatternTS(
    curr: CandleData,
    prev: CandleData,
    i: number,
    currBull: boolean,
    currBear: boolean,
    prevBull: boolean,
    prevBear: boolean,
    plusBullCond: boolean,
    plusBearCond: boolean,
    getBullTargetsV2: () => { entry: number; sl: number; tp1: number; tp2: number; tp3: number },
    getBearTargetsV2: () => { entry: number; sl: number; tp1: number; tp2: number; tp3: number },
    entry: number,
): SuperEngulfingSignal[] {
    const signals: SuperEngulfingSignal[] = [];

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
            entryZone: entry,
            sl: targets.sl,
            tp1: targets.tp1,
            tp2: targets.tp2,
            pattern_v2: isPlus ? 'RUN_PLUS_BULLISH' : 'RUN_BULLISH',
            direction_v2: 'bullish',
            entry_price: targets.entry,
            sl_price: targets.sl,
            tp1_price: targets.tp1,
            tp2_price: targets.tp2,
            tp3_price: targets.tp3,
            candle_high: curr.high,
            candle_low: curr.low,
        });
    }

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
            entryZone: entry,
            sl: targets.sl,
            tp1: targets.tp1,
            tp2: targets.tp2,
            pattern_v2: isPlus ? 'RUN_PLUS_BEARISH' : 'RUN_BEARISH',
            direction_v2: 'bearish',
            entry_price: targets.entry,
            sl_price: targets.sl,
            tp1_price: targets.tp1,
            tp2_price: targets.tp2,
            tp3_price: targets.tp3,
            candle_high: curr.high,
            candle_low: curr.low,
        });
    }
    return signals;
}

function checkRevPatternTS(
    curr: CandleData,
    prev: CandleData,
    i: number,
    currBull: boolean,
    currBear: boolean,
    prevBull: boolean,
    prevBear: boolean,
    plusBullCond: boolean,
    plusBearCond: boolean,
    getBullTargetsV2: () => { entry: number; sl: number; tp1: number; tp2: number; tp3: number },
    getBearTargetsV2: () => { entry: number; sl: number; tp1: number; tp2: number; tp3: number },
    entry: number,
): SuperEngulfingSignal[] {
    const signals: SuperEngulfingSignal[] = [];

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
            entryZone: entry,
            sl: targets.sl,
            tp1: targets.tp1,
            tp2: targets.tp2,
            pattern_v2: isPlus ? 'REV_PLUS_BULLISH' : 'REV_BULLISH',
            direction_v2: 'bullish',
            entry_price: targets.entry,
            sl_price: targets.sl,
            tp1_price: targets.tp1,
            tp2_price: targets.tp2,
            tp3_price: targets.tp3,
            candle_high: curr.high,
            candle_low: curr.low,
        });
    }

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
            entryZone: entry,
            sl: targets.sl,
            tp1: targets.tp1,
            tp2: targets.tp2,
            pattern_v2: isPlus ? 'REV_PLUS_BEARISH' : 'REV_BEARISH',
            direction_v2: 'bearish',
            entry_price: targets.entry,
            sl_price: targets.sl,
            tp1_price: targets.tp1,
            tp2_price: targets.tp2,
            tp3_price: targets.tp3,
            candle_high: curr.high,
            candle_low: curr.low,
        });
    }
    return signals;
}

export function detectSuperEngulfing(candles: CandleData[]): SuperEngulfingSignal[] {
    const signals: SuperEngulfingSignal[] = [];
    if (candles.length < 2) return signals;

    const i = candles.length - 1;
    const curr = candles[i];
    const prev = candles[i - 1];

    const currBull = curr.close > curr.open;
    const currBear = curr.close < curr.open;
    const prevBull = prev.close > prev.open;
    const prevBear = prev.close < prev.open;

    const plusBullCond = curr.close > prev.high;
    const plusBearCond = curr.close < prev.low;

    const entry = curr.close;

    const candle_range = curr.high - curr.low;
    const buffer = candle_range * 0.1;

    const getBullTargetsV2 = () => {
        const sl = curr.low - buffer;
        const risk = entry - sl;
        const tp1 = entry + (risk * 1.5);
        const tp2 = entry + (risk * 2);
        const tp3 = entry + (risk * 3);
        return { entry, sl, tp1, tp2, tp3 };
    };

    const getBearTargetsV2 = () => {
        const sl = curr.high + buffer;
        const risk = sl - entry;
        const tp1 = entry - (risk * 1.5);
        const tp2 = entry - (risk * 2);
        const tp3 = entry - (risk * 3);
        return { entry, sl, tp1, tp2, tp3 };
    };

    signals.push(...checkRunPatternTS(curr, prev, i, currBull, currBear, prevBull, prevBear, plusBullCond, plusBearCond, getBullTargetsV2, getBearTargetsV2, entry));
    signals.push(...checkRevPatternTS(curr, prev, i, currBull, currBear, prevBull, prevBear, plusBullCond, plusBearCond, getBullTargetsV2, getBearTargetsV2, entry));

    return signals;
}
