import React from 'react';
import type { PlusSummary } from '../../core-layer/types';

interface PlusBadgeProps {
  summary: PlusSummary;
  className?: string;
}

/**
 * SE Plus summary pill. Renders only when at least one chain TF is a Plus
 * variant. `all` carries a stronger glow + lightning bolt, `dominant` a
 * subtler flash icon, `none` returns null so callers can pass the summary
 * through unconditionally.
 */
export const PlusBadge: React.FC<PlusBadgeProps> = ({ summary, className = '' }) => {
  if (summary === 'none') return null;

  if (summary === 'all') {
    return (
      <span
        className={`relative inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-gradient-to-r from-primary/30 to-primary/15 text-primary border-primary/50 text-[10px] font-black uppercase tracking-[0.12em] leading-none shadow-[0_0_12px_-2px_rgba(19,236,55,0.6)] ${className}`}
        title="Every TF in this chain is a Plus-variant SE pattern"
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-md bg-primary/10 animate-pulse opacity-60"
        />
        <span className="relative material-symbols-outlined text-[12px] leading-none">
          bolt
        </span>
        <span className="relative">All Plus</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-primary/10 text-primary border-primary/30 text-[10px] font-black uppercase tracking-[0.1em] leading-none ${className}`}
      title="Majority of TFs in this chain are Plus-variant SE patterns"
    >
      <span className="material-symbols-outlined text-[12px] leading-none">flash_on</span>
      <span>Plus</span>
    </span>
  );
};
