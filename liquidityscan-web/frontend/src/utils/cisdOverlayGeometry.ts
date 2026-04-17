/**
 * Pure helpers shared by Lightweight Charts and ECharts CISD overlay builders.
 * Times are Unix seconds (same as LW `Time` when numeric).
 */

export interface GeometryCandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function timeSec(t: number): number {
  return t;
}

export function closestIdx(chartData: GeometryCandleBar[], unixSec: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < chartData.length; i++) {
    const d = Math.abs(timeSec(chartData[i].time) - unixSec);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

function closestIdxBeforeBreakout(
  chartData: GeometryCandleBar[],
  breakoutIdx: number,
  unixSec: number,
): number {
  if (breakoutIdx <= 0) return 0;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < breakoutIdx; i++) {
    const d = Math.abs(timeSec(chartData[i].time) - unixSec);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

export function resolveReverseBarIndex(
  chartData: GeometryCandleBar[],
  breakoutIdx: number,
  meta: Record<string, unknown>,
  revOpenMs: number | undefined,
): number {
  const breakoutSec = timeSec(chartData[breakoutIdx].time);

  const rib = meta.reverse_bar_index;
  if (typeof rib === 'number' && Number.isFinite(rib)) {
    const i = Math.floor(rib);
    if (i >= 0 && i < breakoutIdx && i < chartData.length) {
      if (revOpenMs != null && Number.isFinite(revOpenMs)) {
        const wantSec = Math.floor(revOpenMs / 1000);
        const gotSec = timeSec(chartData[i].time);
        if (Math.abs(gotSec - wantSec) <= 1) return i;
      } else {
        return i;
      }
    }
  }

  if (revOpenMs != null && Number.isFinite(revOpenMs)) {
    const targetSec = Math.floor(revOpenMs / 1000);
    for (let i = breakoutIdx - 1; i >= 0; i--) {
      if (timeSec(chartData[i].time) === targetSec) return i;
    }
    const cand = closestIdxBeforeBreakout(chartData, breakoutIdx, targetSec);
    if (timeSec(chartData[cand].time) < breakoutSec) return cand;
  }

  if (meta.mss_level != null && meta.cisd_direction != null) {
    const isBull = meta.cisd_direction === 'BULL' || meta.cisd_direction === 'BUY';
    const mss = Number(meta.mss_level);
    
    // Search backward from breakout up to 70 bars
    for (let i = breakoutIdx - 1; i >= Math.max(0, breakoutIdx - 70); i--) {
      const bodyExt = isBull
        ? Math.max(chartData[i].open, chartData[i].close)
        : Math.min(chartData[i].open, chartData[i].close);
        
      if (Math.abs(bodyExt - mss) < 0.0001) {
        let valid = true;
        if (meta.pivot_time != null) {
          const pSec = Math.floor(Number(meta.pivot_time) / 1000);
          if (timeSec(chartData[i].time) > pSec) {
            valid = false;
          }
        }
        if (valid) return i;
      }
    }
  }

  return Math.max(0, breakoutIdx - 1);
}

export function chartTimeAtOrBefore(chartData: GeometryCandleBar[], unixSec: number): number {
  for (let j = chartData.length - 1; j >= 0; j--) {
    const tt = chartData[j].time;
    if (tt <= unixSec) return tt;
  }
  return chartData[0].time;
}
