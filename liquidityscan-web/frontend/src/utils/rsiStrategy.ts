export function isRsiDivergenceStrategyType(t: string | undefined): boolean {
  return t === 'RSIDIVERGENCE';
}

export function isRsiDivergenceSignalId(id: string | undefined): boolean {
  if (!id) return false;
  return id.startsWith('RSIDIVERGENCE-');
}
