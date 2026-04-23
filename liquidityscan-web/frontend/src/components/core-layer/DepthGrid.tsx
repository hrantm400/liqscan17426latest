import React, { useState } from 'react';
import type { CoreLayerSignal } from '../../core-layer/types';
import { DEPTH_COLUMNS } from '../../core-layer/constants';
import { useCoreLayerTier } from '../../core-layer/TierContext';
import { SignalCard } from './SignalCard';
import { UpgradeModal } from './UpgradeModal';

interface DepthGridProps {
  signals: CoreLayerSignal[];
  /** Optional set of signal IDs to pulse with the promotion animation. */
  justPromotedIds?: Set<string>;
  className?: string;
}

/**
 * 4-column depth grid: 2 / 3 / 4 / 5-deep. 5-deep is Pro-only (Phase 7.3).
 *
 * SCOUT tier behavior:
 *   - 2 / 3 / 4-deep columns render normally.
 *   - 5-deep column renders the header + blurb + a single "locked" card
 *     in place of the signal list. Clicking the card opens UpgradeModal.
 *   - Backend guarantees no 5-deep signal ever reaches a SCOUT client
 *     (see CoreLayerQueryService + SCOUT_MAX_DEPTH), so grouped lookups
 *     for depth=5 on SCOUT are always empty — the lock card is the only
 *     thing SCOUT sees in that slot.
 *
 * Mobile: horizontal scroll-snap one column at a time below md.
 * Desktop: 4-column grid (was 3 pre-Phase 7.3).
 */
export const DepthGrid: React.FC<DepthGridProps> = ({
  signals,
  justPromotedIds,
  className = '',
}) => {
  const { tier } = useCoreLayerTier();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const grouped = React.useMemo(() => {
    const map = new Map<number, CoreLayerSignal[]>();
    for (const col of DEPTH_COLUMNS) map.set(col.depth, []);
    for (const s of signals) {
      const bucket = map.get(s.depth);
      if (bucket) bucket.push(s);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.lastPromotedAt - a.lastPromotedAt);
    }
    return map;
  }, [signals]);

  // Used to render the depth column "fill bar" — proportional to how
  // populated this column is relative to the busiest depth.
  const maxColumnSize = React.useMemo(() => {
    let m = 0;
    for (const list of grouped.values()) if (list.length > m) m = list.length;
    return m;
  }, [grouped]);

  return (
    <>
      <div
        className={`flex md:grid md:grid-cols-4 gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory md:overflow-visible no-scrollbar pb-2 ${className}`}
      >
        {DEPTH_COLUMNS.map((col) => {
          const list = grouped.get(col.depth) ?? [];
          const locked = col.isProOnly && tier !== 'pro';
          const fillPct = maxColumnSize === 0 ? 0 : (list.length / maxColumnSize) * 100;

          return (
            <section
              key={col.depth}
              className="shrink-0 w-[85vw] md:w-auto snap-start flex flex-col gap-3"
              aria-label={`${col.label} column${locked ? ', Pro only' : ''}`}
            >
              {/* polished column header */}
              <header className="rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 backdrop-blur-sm p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-lg border shrink-0 ${
                        locked
                          ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                          : 'bg-primary/10 border-primary/30 text-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {locked ? 'lock' : 'layers'}
                      </span>
                    </span>
                    <h3 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide truncate">
                      {col.label}
                    </h3>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-black tabular-nums px-2 py-0.5 rounded border leading-none ${
                      locked
                        ? 'bg-amber-400/10 text-amber-400 border-amber-400/30'
                        : list.length > 0
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'dark:bg-white/[0.04] light:bg-slate-100 dark:text-gray-500 light:text-slate-400 dark:border-white/10 light:border-slate-200'
                    }`}
                  >
                    {locked ? 'PRO' : list.length}
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] dark:text-gray-500 light:text-slate-400 leading-snug">
                  {col.blurb}
                </p>
                {/* fill bar */}
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full dark:bg-white/[0.05] light:bg-slate-100">
                  <div
                    className={`h-full transition-all duration-500 ${
                      locked ? 'bg-amber-400/70' : 'bg-primary/70'
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </header>

              <div className="flex flex-col gap-2.5">
                {locked ? (
                  <button
                    type="button"
                    onClick={() => setUpgradeOpen(true)}
                    className="group relative overflow-hidden rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-left transition-all hover:bg-amber-500/10 hover:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    aria-label="5-deep alignments are Pro-only. Upgrade to unlock."
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl"
                    />
                    <div className="relative flex items-center gap-2 mb-2">
                      <span
                        className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-400"
                        aria-hidden="true"
                      >
                        <span className="material-symbols-outlined text-[16px]">workspace_premium</span>
                      </span>
                      <span className="text-xs font-black tracking-[0.18em] uppercase text-amber-400">
                        Pro-only
                      </span>
                    </div>
                    <p className="relative text-xs dark:text-gray-300 light:text-slate-600 leading-relaxed">
                      5-deep chains always include a 15m or 5m sub-hour leaf.
                      Upgrade to Pro to see them live.
                    </p>
                    <span className="relative mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-400">
                      Unlock
                      <span
                        className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      >
                        arrow_forward
                      </span>
                    </span>
                  </button>
                ) : list.length === 0 ? (
                  <div className="rounded-xl border border-dashed dark:border-white/10 light:border-slate-200 p-5 flex flex-col items-center gap-1.5 text-center">
                    <span className="material-symbols-outlined text-[18px] dark:text-gray-600 light:text-slate-400">
                      hourglass_empty
                    </span>
                    <p className="text-[11px] dark:text-gray-500 light:text-slate-400">
                      No {col.label} alignments
                    </p>
                  </div>
                ) : (
                  list.map((s) => (
                    <SignalCard
                      key={s.id}
                      signal={s}
                      isJustPromoted={justPromotedIds?.has(s.id)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        depth={5}
      />
    </>
  );
};
