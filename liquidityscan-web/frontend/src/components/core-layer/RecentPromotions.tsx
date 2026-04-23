import React from 'react';
import { Link } from 'react-router-dom';
import type { CoreLayerHistoryEntry, CoreLayerSignal, CoreLayerVariant } from '../../core-layer/types';
import { VARIANT_META } from '../../core-layer/constants';

interface RecentPromotionsProps {
  rows: Array<{ signal: CoreLayerSignal; entry: CoreLayerHistoryEntry }>;
  className?: string;
}

// Same accent palette as VariantSummaryCard so the two widgets read as a pair.
const VARIANT_ACCENT: Record<CoreLayerVariant, { rgb: string; hex: string }> = {
  SE: { rgb: '19,236,55', hex: '#13ec37' },
  CRT: { rgb: '34,211,238', hex: '#22d3ee' },
  BIAS: { rgb: '167,139,250', hex: '#a78bfa' },
};

/**
 * "Recent promotions" widget on the overview page. Each row summarises a
 * promotion event (`fromDepth → toDepth`) with a relative timestamp and a
 * link to the corresponding pair detail page.
 */
export const RecentPromotions: React.FC<RecentPromotionsProps> = ({ rows, className = '' }) => {
  if (rows.length === 0) {
    return (
      <div
        className={`rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 p-6 flex flex-col items-center gap-2 text-center ${className}`}
      >
        <span className="material-symbols-outlined text-[20px] dark:text-gray-600 light:text-slate-400">
          hourglass_empty
        </span>
        <p className="text-xs dark:text-gray-500 light:text-slate-400">
          No recent promotions yet — depth changes will appear here as the scanner runs.
        </p>
      </div>
    );
  }

  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {rows.map(({ signal, entry }) => {
        const variant = VARIANT_META[signal.variant];
        const accent = VARIANT_ACCENT[signal.variant];
        const href = `/core-layer/${variant.urlSlug}/${signal.pair}`;
        const isBuy = signal.direction === 'BUY';
        const dirClass = isBuy ? 'text-primary' : 'text-red-400';
        const dirIcon = isBuy ? 'trending_up' : 'trending_down';
        return (
          <li key={`${signal.id}-${entry.at}`}>
            <Link
              to={href}
              style={{ ['--accent-rgb' as string]: accent.rgb }}
              className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 px-3 py-2.5 transition-all hover:border-[rgba(var(--accent-rgb),0.45)] hover:shadow-[0_4px_18px_-10px_rgba(var(--accent-rgb),0.5)]"
            >
              {/* left edge accent line — shows variant at-a-glance */}
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 w-0.5 rounded-r"
                style={{ backgroundColor: `rgba(var(--accent-rgb),0.7)` }}
              />
              <div className="flex items-center gap-2.5 min-w-0 pl-1.5">
                <span className={`material-symbols-outlined text-[18px] ${dirClass}`}>
                  {dirIcon}
                </span>
                <span className="text-sm font-bold dark:text-white light:text-slate-900 truncate">
                  {signal.pair}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                  style={{
                    color: accent.hex,
                    borderColor: `rgba(var(--accent-rgb),0.35)`,
                    backgroundColor: `rgba(var(--accent-rgb),0.1)`,
                  }}
                >
                  {variant.shortLabel}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono">
                <DepthTransition from={entry.fromDepth} to={entry.toDepth} />
                <span className="dark:text-gray-500 light:text-slate-400">
                  {formatAgo(entry.at)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

const DepthTransition: React.FC<{ from?: number; to?: number }> = ({ from, to }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md dark:bg-white/[0.04] light:bg-slate-100 dark:text-gray-300 light:text-slate-700">
    <span className="font-bold">{from ?? '?'}</span>
    <span className="material-symbols-outlined text-[12px] text-primary">arrow_right_alt</span>
    <span className="font-black text-primary">{to ?? '?'}</span>
  </span>
);

function formatAgo(ts: number): string {
  // Mock data is anchored to MOCK_NOW but the widget uses wall-clock so users
  // see a "live-ish" relative timestamp. In Phase 5 this is fine: real server
  // timestamps are within seconds of now.
  const dt = Date.now() - ts;
  const mins = Math.max(1, Math.round(dt / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
