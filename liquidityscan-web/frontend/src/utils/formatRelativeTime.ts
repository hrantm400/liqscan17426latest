/**
 * Past-only relative labels for signals and UI (e.g. "7h 15m ago", "2d 3h ago").
 */
export function formatRelativeTimeAgo(from: string | Date, nowMs: number = Date.now()): string {
  const t = typeof from === 'string' ? new Date(from).getTime() : from.getTime();
  if (Number.isNaN(t)) return '—';

  const diff = Math.max(0, nowMs - t);
  const minTotal = Math.floor(diff / 60_000);

  if (minTotal < 1) return 'just now';
  if (minTotal < 60) return `${minTotal}m ago`;

  const hTotal = Math.floor(minTotal / 60);
  const minRem = minTotal % 60;

  if (hTotal < 24) {
    return minRem > 0 ? `${hTotal}h ${minRem}m ago` : `${hTotal}h ago`;
  }

  const d = Math.floor(hTotal / 24);
  const hRem = hTotal % 24;

  if (d < 7) {
    if (hRem > 0 && minRem > 0) return `${d}d ${hRem}h ${minRem}m ago`;
    if (hRem > 0) return `${d}d ${hRem}h ago`;
    if (minRem > 0) return `${d}d ${minRem}m ago`;
    return `${d}d ago`;
  }

  if (d < 30) {
    return hRem > 0 ? `${d}d ${hRem}h ago` : `${d}d ago`;
  }

  return `${d}d ago`;
}
