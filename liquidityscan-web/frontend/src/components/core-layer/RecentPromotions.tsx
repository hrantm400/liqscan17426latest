import React from 'react';
import { Link } from 'react-router-dom';
import type { CoreLayerHistoryEntry, CoreLayerSignal } from '../../core-layer/types';
import { VARIANT_META } from '../../core-layer/constants';

interface RecentPromotionsProps {
  rows: Array<{ signal: CoreLayerSignal; entry: CoreLayerHistoryEntry }>;
  className?: string;
}

/**
 * "Recent promotions" widget on the overview page. Each row summarises a
 * promotion event (`fromDepth → toDepth`) with a relative timestamp and a
 * link to the corresponding pair detail page.
 */
export const RecentPromotions: React.FC<RecentPromotionsProps> = ({ rows, className = '' }) => {
  if (rows.length === 0) {
    return (
      <div
        className={`rounded-2xl border dark:border-white/10 light:border-slate-200 p-4 text-xs dark:text-gray-500 light:text-slate-400 text-center ${className}`}
      >
        No recent promotions yet.
      </div>
    );
  }

  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {rows.map(({ signal, entry }) => {
        const variant = VARIANT_META[signal.variant];
        const href = `/core-layer/${variant.urlSlug}/${signal.pair}`;
        return (
          <li key={`${signal.id}-${entry.at}`}>
            <Link
              to={href}
              className="flex items-center justify-between gap-3 rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 px-3 py-2 transition-colors dark:hover:bg-white/5 light:hover:bg-white"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-primary text-[16px]">
                  trending_up
                </span>
                <span className="text-sm font-bold dark:text-white light:text-slate-900 truncate">
                  {signal.pair}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider dark:text-gray-500 light:text-slate-400">
                  {variant.shortLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono">
                <span className="dark:text-gray-400 light:text-slate-500">
                  {entry.fromDepth ?? '?'}→{entry.toDepth ?? '?'}
                </span>
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
