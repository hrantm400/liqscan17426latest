/**
 * Deep-link helpers for opening the correct in-app monitor from a floating chart.
 */

const STRATEGY_TO_PATH: Record<string, string> = {
  SUPER_ENGULFING: '/monitor/superengulfing',
  ICT_BIAS: '/monitor/bias',
  RSIDIVERGENCE: '/monitor/rsi',
  CRT: '/monitor/crt',
  '3OB': '/monitor/3ob',
  CISD: '/monitor/cisd',
};

export function getMonitorLocationForStrategy(strategyType: string): { pathname: string } | null {
  const pathname = STRATEGY_TO_PATH[strategyType];
  if (!pathname) return null;
  return { pathname };
}

/** Base symbol for search filter (monitors match symbol.includes) */
function symbolSearchToken(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s.endsWith('USDT')) return s.slice(0, -4);
  return s;
}

/**
 * Query string for monitor pages that support ?search= and ?timeframe=
 */
export function buildMonitorSearchParams(
  _strategyType: string,
  symbol: string,
  timeframe: string,
): string {
  const params = new URLSearchParams();
  const token = symbolSearchToken(symbol);
  if (token) params.set('search', token);
  const tf = timeframe.trim().toLowerCase();
  if (tf) params.set('timeframe', tf);
  return params.toString();
}
