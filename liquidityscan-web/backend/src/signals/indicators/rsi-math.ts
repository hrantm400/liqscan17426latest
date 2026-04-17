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
