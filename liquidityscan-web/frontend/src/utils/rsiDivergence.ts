/**
 * Pure RSI / pivot / divergence helpers — engine-independent number
 * crunching. Used by InteractiveLiveChart for the RSI sub-pane and
 * divergence trend lines on RSI-divergence signals.
 */

/**
 * Wilder's RSI, default length 14. Matches TradingView's default RSI
 * indicator. Returns an array same length as `closes`, with `NaN` for the
 * warmup period (first `length` values).
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

export function findPivotLows(
  data: number[],
  lbL = 5,
  lbR = 5,
): boolean[] {
  const pivots = new Array(data.length).fill(false);
  for (let i = lbL; i < data.length - lbR; i++) {
    if (isNaN(data[i])) continue;
    let isPivot = true;
    for (let j = 1; j <= lbL; j++) {
      if (isNaN(data[i - j]) || data[i - j] <= data[i]) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;
    for (let j = 1; j <= lbR; j++) {
      if (isNaN(data[i + j]) || data[i + j] <= data[i]) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots[i] = true;
  }
  return pivots;
}

export function findPivotHighs(
  data: number[],
  lbL = 5,
  lbR = 5,
): boolean[] {
  const pivots = new Array(data.length).fill(false);
  for (let i = lbL; i < data.length - lbR; i++) {
    if (isNaN(data[i])) continue;
    let isPivot = true;
    for (let j = 1; j <= lbL; j++) {
      if (isNaN(data[i - j]) || data[i - j] >= data[i]) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;
    for (let j = 1; j <= lbR; j++) {
      if (isNaN(data[i + j]) || data[i + j] >= data[i]) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots[i] = true;
  }
  return pivots;
}

export interface DivergenceResult {
  prevPivotIdx: number;
  currPivotIdx: number;
  prevPivotPrice: number;
  currPivotPrice: number;
  prevPivotRsi: number;
  currPivotRsi: number;
  type: 'bullish' | 'bearish';
}

/**
 * Find the LAST regular RSI divergence in the data window. Mirrors the
 * Pine / TradingView convention used in the LW chart:
 *
 *   bullish: price LL + RSI HL, with the previous RSI pivot below 30
 *            (oversold zone — confirms the divergence is meaningful)
 *   bearish: price HH + RSI LH, with the previous RSI pivot above 70
 *            (overbought zone)
 *
 * Range constraint: 5–60 bars between the two pivots — short enough to be
 * relevant, long enough to filter noise. Constants pinned to match LW.
 */
export function detectLastDivergence(
  candles: { high: number; low: number; close: number; openTime: string | number }[],
  rsiValues: number[],
  signalType: 'BUY' | 'SELL',
  divergenceType: string,
): DivergenceResult | null {
  const lbL = 5;
  const lbR = 5;
  const rangeLower = 5;
  const rangeUpper = 60;
  const limitUpper = 70;
  const limitLower = 30;

  const isBullish =
    signalType === 'BUY' || (divergenceType?.includes('bullish') ?? false);

  if (isBullish) {
    const pivotLows = findPivotLows(rsiValues, lbL, lbR);
    const positions: number[] = [];
    for (let i = 0; i < pivotLows.length; i++) if (pivotLows[i]) positions.push(i);

    for (let k = positions.length - 1; k >= 1; k--) {
      const curr = positions[k];
      const prev = positions[k - 1];
      const barsBetween = curr - prev;
      if (barsBetween < rangeLower || barsBetween > rangeUpper) continue;

      const oscCurr = rsiValues[curr];
      const oscPrev = rsiValues[prev];
      const priceCurr = candles[curr].low;
      const pricePrev = candles[prev].low;

      if (priceCurr < pricePrev && oscCurr > oscPrev && oscPrev < limitLower) {
        return {
          prevPivotIdx: prev,
          currPivotIdx: curr,
          prevPivotPrice: pricePrev,
          currPivotPrice: priceCurr,
          prevPivotRsi: oscPrev,
          currPivotRsi: oscCurr,
          type: 'bullish',
        };
      }
    }
  } else {
    const pivotHighs = findPivotHighs(rsiValues, lbL, lbR);
    const positions: number[] = [];
    for (let i = 0; i < pivotHighs.length; i++) if (pivotHighs[i]) positions.push(i);

    for (let k = positions.length - 1; k >= 1; k--) {
      const curr = positions[k];
      const prev = positions[k - 1];
      const barsBetween = curr - prev;
      if (barsBetween < rangeLower || barsBetween > rangeUpper) continue;

      const oscCurr = rsiValues[curr];
      const oscPrev = rsiValues[prev];
      const priceCurr = candles[curr].high;
      const pricePrev = candles[prev].high;

      if (priceCurr > pricePrev && oscCurr < oscPrev && oscPrev > limitUpper) {
        return {
          prevPivotIdx: prev,
          currPivotIdx: curr,
          prevPivotPrice: pricePrev,
          currPivotPrice: priceCurr,
          prevPivotRsi: oscPrev,
          currPivotRsi: oscCurr,
          type: 'bearish',
        };
      }
    }
  }
  return null;
}
