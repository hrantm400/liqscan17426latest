import { type ComponentProps } from 'react';
import { InteractiveLiveChart } from './InteractiveLiveChart';

export type InteractiveLiveChartGateProps = ComponentProps<typeof InteractiveLiveChart>;

/** Native chart: Lightweight Charts only (ECharts experiment removed). */
export function InteractiveLiveChartGate(props: InteractiveLiveChartGateProps) {
  return <InteractiveLiveChart {...props} />;
}
