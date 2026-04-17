export interface CandleData {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export type CISD_MSS_TYPE = 'MSS' | 'HIGH_PROB_MSS' | 'TRAP_MSS';

export interface CISDSignal {
    direction: 'BUY' | 'SELL';
    mssType: CISD_MSS_TYPE;
    barIndex: number;
    time: number;
    price: number;
    mssLevel: number;
    fib50: number;
    pivotPrice: number;
    pivotBarIndex: number;
    hasFvg: boolean;
    fvgHigh: number | null;
    fvgLow: number | null;
    fvgStartTime: number | null;
    proximityUpper: number;
    proximityLower: number;
    revCandleOpen: number;
    revCandleClose: number;
    /** Reverse (MSS body) candle open time, ms — anchors MSS/Fib lines in drawCisdOverlays */
    revCandleTime: number;
}

export interface CisdOptions {
    lbLeft: number;
    lbRight: number;
    minSeq: number;
}

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
    revCandleOpen: number;
    revCandleClose: number;
    revCandleTime: number;
}

export function detectAllMSS(candles: CandleData[], options: CisdOptions): CISDSignal[] {
    const n = candles.length;
    if (n < 50) return [];

    const raw: CISDSignal[] = [];

    let pendingBull: PendingSetup | null = null;
    let pendingBear: PendingSetup | null = null;

    const { lbLeft, lbRight, minSeq } = options;
    const startI = lbLeft + lbRight;
    
    for (let i = startI; i < n; i++) {
        const p = i - lbRight;

        if (p >= lbLeft && isPivotLow(candles, p, lbLeft, lbRight)) {
            const pivotPrice = candles[p].low;
            let foundBullRev = false;
            let revIdx = 0;

            for (let lookback = 1; lookback <= 50; lookback++) {
                const idx = p - lookback;
                if (idx < 0) break;

                if (candles[idx].close > candles[idx].open) {
                    let validSeq = true;
                    if (lookback < minSeq) {
                        validSeq = false;
                    } else {
                        for (let k = 1; k <= minSeq; k++) {
                            const forwardIdx = idx + k;
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
                const mssBody = Math.max(candles[revIdx].open, candles[revIdx].close);
                const fib50 = (mssBody + pivotPrice) / 2;

                pendingBull = {
                    direction: 'BUY',
                    mssLevel: mssBody,
                    fib50: fib50,
                    pivotPrice: pivotPrice,
                    pivotBarIndex: p,
                    revCandleOpen: candles[revIdx].open,
                    revCandleClose: candles[revIdx].close,
                    revCandleTime: candles[revIdx].openTime,
                };
            }
        }

        if (p >= lbLeft && isPivotHigh(candles, p, lbLeft, lbRight)) {
            const pivotPrice = candles[p].high;
            let foundBearRev = false;
            let revIdx = 0;

            for (let lookback = 1; lookback <= 50; lookback++) {
                const idx = p - lookback;
                if (idx < 0) break;

                if (candles[idx].close < candles[idx].open) {
                    let validSeq = true;
                    if (lookback < minSeq) {
                        validSeq = false;
                    } else {
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
                const mssBody = Math.min(candles[revIdx].open, candles[revIdx].close);
                const fib50 = (mssBody + pivotPrice) / 2;

                pendingBear = {
                    direction: 'SELL',
                    mssLevel: mssBody,
                    fib50: fib50,
                    pivotPrice: pivotPrice,
                    pivotBarIndex: p,
                    revCandleOpen: candles[revIdx].open,
                    revCandleClose: candles[revIdx].close,
                    revCandleTime: candles[revIdx].openTime,
                };
            }
        }

        if (pendingBull !== null && candles[i].close > pendingBull.mssLevel) {
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
                revCandleOpen: pendingBull.revCandleOpen,
                revCandleClose: pendingBull.revCandleClose,
                revCandleTime: pendingBull.revCandleTime,
            });

            pendingBull = null;
        }

        if (pendingBear !== null && candles[i].close < pendingBear.mssLevel) {
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
                revCandleOpen: pendingBear.revCandleOpen,
                revCandleClose: pendingBear.revCandleClose,
                revCandleTime: pendingBear.revCandleTime,
            });

            pendingBear = null;
        }
    }

    return raw;
}
