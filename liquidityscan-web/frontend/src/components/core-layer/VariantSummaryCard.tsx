import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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
 * live count and a per-anchor distribution bar. Click navigates to the
 * deep-dive page.
 */

// Per-variant accent. rgb tuples used inline so Tailwind JIT does not need
// to safelist arbitrary border/bg-[rgba()] classes.
const VARIANT_ACCENT: Record<CoreLayerVariant, { rgb: string; hex: string; label: string }> = {
  SE: { rgb: '19,236,55', hex: '#13ec37', label: 'SuperEngulfing' },
  CRT: { rgb: '34,211,238', hex: '#22d3ee', label: 'Candle Range' },
  BIAS: { rgb: '167,139,250', hex: '#a78bfa', label: 'Bias-flip' },
};

const ANCHOR_COLOR: Record<AnchorType, string> = {
  WEEKLY: 'bg-amber-400',
  DAILY: 'bg-sky-400',
  FOURHOUR: 'bg-fuchsia-400',
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
  const total = anchorBreakdown.WEEKLY + anchorBreakdown.DAILY + anchorBreakdown.FOURHOUR;
  const hasActive = activeCount > 0;

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 350, damping: 26 }}
      className={className}
    >
      <Link
        to={href}
        style={{
          ['--accent-rgb' as string]: accent.rgb,
          ['--accent' as string]: accent.hex,
        }}
        className="group relative block overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-[#0d1310]/80 light:bg-white/90 backdrop-blur-md p-5 transition-all duration-300 hover:border-[rgba(var(--accent-rgb),0.5)] hover:shadow-[0_10px_40px_-12px_rgba(var(--accent-rgb),0.55)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.5)]"
        aria-label={`Open ${meta.label} (${activeCount} active alignments)`}
      >
        {/* ambient glow blob — top-right */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
          style={{ background: `radial-gradient(circle, rgba(var(--accent-rgb),0.6), transparent 70%)` }}
        />
        {/* subtle accent corner ribbon */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-px w-24 transition-all duration-300 group-hover:w-40"
          style={{ background: `linear-gradient(to left, rgba(var(--accent-rgb),0.7), transparent)` }}
        />

        {/* header: icon + label + variant chip */}
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="grid h-11 w-11 place-items-center rounded-xl border shrink-0 transition-transform duration-300 group-hover:scale-110"
              style={{
                color: 'var(--accent)',
                borderColor: `rgba(var(--accent-rgb),0.35)`,
                backgroundColor: `rgba(var(--accent-rgb),0.08)`,
                boxShadow: `0 0 18px -4px rgba(var(--accent-rgb),0.45)`,
              }}
            >
              <span className="material-symbols-outlined text-[22px]">{meta.icon}</span>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide truncate">
                  {meta.shortLabel}
                </h3>
                <span
                  className="text-[9px] font-black uppercase tracking-[0.18em] px-1.5 py-0.5 rounded leading-none"
                  style={{
                    color: accent.hex,
                    backgroundColor: `rgba(var(--accent-rgb),0.1)`,
                  }}
                >
                  Core-Layer
                </span>
              </div>
              <p className="mt-0.5 text-[11px] dark:text-gray-400 light:text-slate-500 truncate">
                {meta.tagline}
              </p>
            </div>
          </div>
        </div>

        {/* big count + active dot */}
        <div className="relative mt-5 flex items-end justify-between gap-3">
          <div>
            <div
              className="text-[44px] leading-none font-black tabular-nums"
              style={{
                color: 'var(--accent)',
                filter: `drop-shadow(0 0 12px rgba(var(--accent-rgb),0.45))`,
              }}
            >
              {activeCount}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-400">
              {hasActive && (
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{
                    backgroundColor: accent.hex,
                    boxShadow: `0 0 8px rgba(var(--accent-rgb),0.7)`,
                  }}
                />
              )}
              <span>active alignments</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-400">
              total
            </div>
            <div className="text-base font-black dark:text-white light:text-slate-900">{total}</div>
          </div>
        </div>

        {/* anchor distribution bar — proportional segments */}
        <div className="relative mt-4">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full dark:bg-white/[0.05] light:bg-slate-100">
            {(['WEEKLY', 'DAILY', 'FOURHOUR'] as AnchorType[]).map((a) => {
              const c = anchorBreakdown[a];
              const pct = total === 0 ? 0 : (c / total) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={a}
                  className={`${ANCHOR_COLOR[a]} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${a}: ${c}`}
                />
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <AnchorChip label="Weekly" count={anchorBreakdown.WEEKLY} dot="bg-amber-400" />
            <AnchorChip label="Daily" count={anchorBreakdown.DAILY} dot="bg-sky-400" />
            <AnchorChip label="4H" count={anchorBreakdown.FOURHOUR} dot="bg-fuchsia-400" />
          </div>
        </div>

        {/* footer CTA — appears on hover */}
        <div
          className="relative mt-4 flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-widest opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0"
          style={{ color: accent.hex }}
        >
          <span>Open scanner</span>
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </div>
      </Link>
    </motion.div>
  );
};

const AnchorChip: React.FC<{ label: string; count: number; dot: string }> = ({ label, count, dot }) => {
  const has = count > 0;
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 dark:bg-white/[0.03] light:bg-slate-50 border dark:border-white/5 light:border-slate-200 ${
        has ? '' : 'opacity-50'
      }`}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-wider dark:text-gray-400 light:text-slate-500 truncate">
          {label}
        </span>
      </span>
      <span className="text-xs font-black tabular-nums dark:text-white light:text-slate-900">{count}</span>
    </div>
  );
};
