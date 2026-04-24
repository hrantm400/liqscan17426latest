import { type ComponentProps } from 'react';
import { InteractiveLiveChart } from './InteractiveLiveChart';
import { KlineInteractiveLiveChart } from './KlineInteractiveLiveChart';
import { isRsiDivergenceSignalId } from '../utils/rsiStrategy';

export type InteractiveLiveChartGateProps = ComponentProps<typeof InteractiveLiveChart>;

/**
 * Read the chart-engine flag from the URL once at render. Default engine is
 * lightweight-charts (InteractiveLiveChart). When the URL carries
 * `?engine=kline`, dispatch to KlineInteractiveLiveChart — opt-in PoC for
 * the chart-library migration. Anyone without the flag sees zero behavior
 * change.
 *
 * RSI-divergence signals always fall back to LW regardless of the flag —
 * the kline path doesn't yet implement the RSI sub-pane (Chunk #5).
 */
function useChartEngine(): 'lw' | 'kline' {
  if (typeof window === 'undefined') return 'lw';
  const v = new URLSearchParams(window.location.search).get('engine');
  return v === 'kline' ? 'kline' : 'lw';
}

/**
 * Native chart gate. Dispatches to the right engine implementation based
 * on URL flag + signal kind. The two implementations share the exact prop
 * surface (InteractiveLiveChartGateProps), so the parent component is
 * unaware of which engine is rendering.
 */
export function InteractiveLiveChartGate(props: InteractiveLiveChartGateProps) {
  const engine = useChartEngine();
  const isRsi = isRsiDivergenceSignalId(props.signal?.id);
  if (engine === 'kline' && !isRsi) {
    return <KlineInteractiveLiveChart {...props} />;
  }
  return <InteractiveLiveChart {...props} />;
}
