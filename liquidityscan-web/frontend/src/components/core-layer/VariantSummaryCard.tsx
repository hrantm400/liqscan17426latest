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

// Per-variant accent so SE/CRT/BIAS are visually distinct at a glance.
// rgb tuples used inline so Tailwind's JIT does not need to safelist them.
const VARIANT_ACCENT: Record<CoreLayerVariant, { rgb: string; hex: string }> = {
  SE: { rgb: '19,236,55', hex: '#13ec37' },
  CRT: { rgb: '34,211,238', hex: '#22d3ee' },
  BIAS: { rgb: '167,139,250', hex: '#a78bfa' },
};

export const VariantSummaryCard: React.FC<VariantSummaryCardProps> = ({
  variant,
  activeCount,
  anchorBreakdown,
  className = '',
}) => {
  const meta = VARIANT_META[variant];
  const accent = VARIANT_ACCENT[variant];
  const href = `/core-layer/${meta.urlSlug}`;
  const hasActive = activeCount > 0;
  return (
    <Link
      to={href}
      style={{
        ['--accent-rgb' as string]: accent.rgb,
        ['--accent' as string]: accent.hex,
      }}
      className={`group relative block overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/80 backdrop-blur-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(var(--accent-rgb),0.45)] hover:shadow-[0_8px_28px_-12px_rgba(var(--accent-rgb),0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.5)] ${className}`}
      aria-label={`Open ${meta.label} (${activeCount} active alignments)`}
    >
      {/* ambient accent glow — purely decorative, sits behind content */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-30 blur-3xl transition-opacity duration-300 group-hover:opacity-60"
        style={{ background: `radial-gradient(circle, rgba(var(--accent-rgb),0.55), transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined text-[24px]"
            style={{
              color: 'var(--accent)',
              filter: `drop-shadow(0 0 6px rgba(var(--accent-rgb),0.5))`,
            }}
          >
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
          <div
            className="text-3xl font-black leading-none"
            style={{
              color: 'var(--accent)',
              filter: `drop-shadow(0 0 8px rgba(var(--accent-rgb),0.4))`,
            }}
          >
            {activeCount}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] font-mono font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-400">
            {hasActive && (
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            )}
            <span>active</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <AnchorPill label="Weekly" count={anchorBreakdown.WEEKLY} />
        <AnchorPill label="Daily" count={anchorBreakdown.DAILY} />
        <AnchorPill label="4H" count={anchorBreakdown.FOURHOUR} />
      </div>

      <div className="relative mt-4 flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wider opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ color: 'var(--accent)' }}>
        <span>Open deep-dive</span>
        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      </div>
    </Link>
  );
};

const AnchorPill: React.FC<{ label: string; count: number }> = ({ label, count }) => {
  const has = count > 0;
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-2 py-1.5 transition-colors ${
        has
          ? 'dark:border-white/15 light:border-slate-300 dark:bg-black/30 light:bg-slate-100'
          : 'dark:border-white/5 light:border-slate-200 dark:bg-black/10 light:bg-slate-50/60 opacity-60'
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider dark:text-gray-400 light:text-slate-500">
        {label}
      </span>
      <span className="text-xs font-black dark:text-white light:text-slate-900">{count}</span>
    </div>
  );
};
