import React from 'react';
import type { TF } from '../../core-layer/types';

interface CorrelationBadgeProps {
  pair: [TF, TF];
  className?: string;
}

/**
 * Pill showing a high-correlation TF pairing, e.g. `1D + 1H`. Rendered on
 * signal cards and in the pair-detail header. v1 only ships `1D + 1H`; the
 * other two pairings (`4H+15m`, `1H+5m`) are Phase 7 surface.
 *
 * Visual: each TF is its own micro-block, joined by an animated link icon —
 * the "linked timeframes" semantics is far easier to scan than the previous
 * `1D+1H` text run.
 */
export const CorrelationBadge: React.FC<CorrelationBadgeProps> = ({ pair, className = '' }) => {
  const [htf, ltf] = pair;
  return (
    <span
      className={`group inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border bg-primary/10 border-primary/30 shadow-[0_0_8px_-3px_rgba(19,236,55,0.5)] ${className}`}
      title={`High-correlation pairing: ${htf} + ${ltf}`}
    >
      <span className="text-[10px] font-mono font-black tracking-wider text-primary leading-none">
        {htf}
      </span>
      <span
        className="material-symbols-outlined text-primary text-[12px] leading-none transition-transform group-hover:rotate-12"
        aria-hidden
      >
        link
      </span>
      <span className="text-[10px] font-mono font-black tracking-wider text-primary leading-none">
        {ltf}
      </span>
    </span>
  );
};
