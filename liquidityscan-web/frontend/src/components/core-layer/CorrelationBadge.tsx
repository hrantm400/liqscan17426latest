import React from 'react';
import type { TF } from '../../core-layer/types';

interface CorrelationBadgeProps {
  pair: [TF, TF];
  className?: string;
}

/**
 * Pill showing a high-correlation TF pairing, e.g. `1D+1H`. Rendered on signal
 * cards and in the pair-detail header. Only populated correlation pairs are
 * passed in; in v1 the mock data produces `1D+1H` exclusively (see spec line
 * 134 — `4H+15m` and `1H+5m` exist in the constant but are Phase 7 surface).
 */
export const CorrelationBadge: React.FC<CorrelationBadgeProps> = ({ pair, className = '' }) => {
  const [htf, ltf] = pair;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/25 text-[10px] font-bold tracking-wide ${className}`}
      title={`High-correlation pairing: ${htf} + ${ltf}`}
    >
      <span className="material-symbols-outlined text-[12px] leading-none">link</span>
      <span>
        {htf}+{ltf}
      </span>
    </span>
  );
};
