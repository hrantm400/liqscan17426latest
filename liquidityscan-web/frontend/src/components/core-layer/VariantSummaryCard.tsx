import React from 'react';
import { Link } from 'react-router-dom';
import type { AnchorType, CoreLayerVariant } from '../../core-layer/types';
import { VARIANT_META } from '../../core-layer/constants';

interface VariantSummaryCardProps {
  variant: CoreLayerVariant;
  activeCount: number;
  anchorBreakdown: Record<AnchorType, number>;
  className?: string;
}

/**
 * Overview-page variant tile: one card per variant (SE / CRT / Bias) with a
 * live count and a per-anchor breakdown. Clicking the card navigates to the
 * corresponding deep-dive page.
 */
export const VariantSummaryCard: React.FC<VariantSummaryCardProps> = ({
  variant,
  activeCount,
  anchorBreakdown,
  className = '',
}) => {
  const meta = VARIANT_META[variant];
  const href = `/core-layer/${meta.urlSlug}`;
  return (
    <Link
      to={href}
      className={`block rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/80 backdrop-blur-sm transition-all dark:hover:border-primary/40 light:hover:border-primary/40 dark:hover:bg-white/[0.05] light:hover:bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 p-5 ${className}`}
      aria-label={`Open ${meta.label} (${activeCount} active alignments)`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[22px] drop-shadow-[0_0_6px_rgba(19,236,55,0.5)]">
            {meta.icon}
          </span>
          <div>
            <h3 className="text-base font-black dark:text-white light:text-slate-900 tracking-wide">
              {meta.label}
            </h3>
            <p className="text-[11px] dark:text-gray-400 light:text-slate-500 mt-0.5">
              {meta.tagline}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-primary leading-none drop-shadow-[0_0_8px_rgba(19,236,55,0.35)]">
            {activeCount}
          </div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-400 mt-0.5">
            active
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <AnchorPill label="Weekly" count={anchorBreakdown.WEEKLY} />
        <AnchorPill label="Daily" count={anchorBreakdown.DAILY} />
        <AnchorPill label="4H" count={anchorBreakdown.FOURHOUR} />
      </div>
    </Link>
  );
};

const AnchorPill: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <div className="flex items-center justify-between rounded-lg border dark:border-white/10 light:border-slate-200 dark:bg-black/20 light:bg-slate-50 px-2 py-1.5">
    <span className="text-[10px] font-bold uppercase tracking-wider dark:text-gray-400 light:text-slate-500">
      {label}
    </span>
    <span className="text-xs font-black dark:text-white light:text-slate-900">{count}</span>
  </div>
);
