/** Backend scanner uses RSIDIVERGENCE; legacy rows may use RSI_DIVERGENCE. */

export function isRsiDivergenceStrategyType(t: string | undefined): boolean {
  return t === 'RSI_DIVERGENCE' || t === 'RSIDIVERGENCE';
}

export function isRsiDivergenceSignalId(id: string | undefined): boolean {
  if (!id) return false;
  return id.startsWith('RSI_DIVERGENCE-') || id.startsWith('RSIDIVERGENCE-');
}
