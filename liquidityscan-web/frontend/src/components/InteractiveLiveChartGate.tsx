import { type ComponentProps } from 'react';
import { InteractiveLiveChart } from './InteractiveLiveChart';
import { KlineInteractiveLiveChart } from './KlineInteractiveLiveChart';

export type InteractiveLiveChartGateProps = ComponentProps<typeof InteractiveLiveChart>;

/**
 * Read the chart-engine flag from the URL once at render. Default engine is
 * lightweight-charts (InteractiveLiveChart). When the URL carries
 * `?engine=kline`, dispatch to KlineInteractiveLiveChart — opt-in PoC for
 * the chart-library migration. Anyone without the flag sees zero behavior
 * change.
 *
 * Chunk #5 (PR #20): RSI-divergence signals now route to klinecharts too
 * — the kline path implements the RSI sub-pane via createIndicator +
 * cl-rsi-divergence overlay (see KlineInteractiveLiveChart). Previously
 * they fell back to LW unconditionally; that branch is gone.
 */
function useChartEngine(): 'lw' | 'kline' {
  if (typeof window === 'undefined') return 'lw';
  const v = new URLSearchParams(window.location.search).get('engine');
  return v === 'kline' ? 'kline' : 'lw';
}

/**
 * Native chart gate. Dispatches to the right engine implementation based
 * on URL flag. The two implementations share the exact prop surface
 * (InteractiveLiveChartGateProps), so the parent component is unaware of
 * which engine is rendering.
 */
export function InteractiveLiveChartGate(props: InteractiveLiveChartGateProps) {
  const engine = useChartEngine();
  if (engine === 'kline') {
    return <KlineInteractiveLiveChart {...props} />;
  }
  return <InteractiveLiveChart {...props} />;
}
