/**
 * Forming-candle helpers for CoreLayerChart.
 *
 * Binance's WS / candles API returns the currently-forming candle as the
 * rightmost element of the array. The signal-candle pattern detection in
 * the backend strips it before evaluating (see scanner.service.ts), but the
 * chart still receives it from the candles API and renders it. To avoid
 * traders confusing a still-growing bar with a closed signal-quality bar,
 * the chart applies a muted ghost style to the forming bar.
 *
 * Kept in its own file (no `./constants` / `./types` imports) so it can be
 * unit-tested under plain Node + ts-jest without pulling in Vite's
 * `import.meta.env` chain.
 */

/**
 * Index of the still-forming (unclosed) candle in the array, or -1 if all
 * candles in the array are closed.
 *
 * Forming criteria: `openTime + intervalMs > now` — the candle's close time
 * has not yet arrived. Only the rightmost candle is checked since Binance
 * never emits earlier-than-last forming candles.
 */
export function findFormingCandleIdx(
  candles: ReadonlyArray<{ openTime: number | string }>,
  intervalMs: number,
  now: number,
): number {
  if (candles.length === 0) return -1;
  const lastIdx = candles.length - 1;
  const last = candles[lastIdx];
  const openMs =
    typeof last.openTime === 'number' ? last.openTime : new Date(last.openTime).getTime();
  return openMs + intervalMs > now ? lastIdx : -1;
}

