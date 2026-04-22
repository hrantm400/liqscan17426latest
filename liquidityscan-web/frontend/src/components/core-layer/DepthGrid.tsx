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

  return (
    <>
      <div
        className={`flex md:grid md:grid-cols-4 gap-4 overflow-x-auto snap-x snap-mandatory md:overflow-visible pb-2 ${className}`}
      >
        {DEPTH_COLUMNS.map((col) => {
          const list = grouped.get(col.depth) ?? [];
          const locked = col.isProOnly && tier !== 'pro';

          return (
            <section
              key={col.depth}
              className="shrink-0 w-[85vw] md:w-auto snap-start flex flex-col gap-3"
              aria-label={`${col.label} column${locked ? ', Pro only' : ''}`}
            >
              <header className="flex items-center justify-between px-1">
                <h3 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide flex items-center gap-1.5">
                  {col.label}
                  {locked && (
                    <span
                      className="material-symbols-outlined text-amber-400 text-[14px]"
                      aria-hidden="true"
                    >
                      lock
                    </span>
                  )}
                </h3>
                <span className="text-[10px] font-mono font-bold dark:text-gray-500 light:text-slate-400 uppercase tracking-wider">
                  {locked
                    ? 'Pro'
                    : `${list.length} signal${list.length === 1 ? '' : 's'}`}
                </span>
              </header>
              <p className="px-1 text-[10px] dark:text-gray-500 light:text-slate-400">
                {col.blurb}
              </p>
              <div className="flex flex-col gap-3">
                {locked ? (
                  <button
                    type="button"
                    onClick={() => setUpgradeOpen(true)}
                    className="group rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-left transition-all hover:bg-amber-500/10 hover:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    aria-label="5-deep alignments are Pro-only. Upgrade to unlock."
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="material-symbols-outlined text-amber-400 text-[18px]"
                        aria-hidden="true"
                      >
                        lock
                      </span>
                      <span className="text-xs font-black tracking-[0.18em] uppercase text-amber-400">
                        Pro-only
                      </span>
                    </div>
                    <p className="text-xs dark:text-gray-300 light:text-slate-600 leading-relaxed">
                      5-deep chains always include a 15m or 5m sub-hour leaf.
                      Upgrade to Pro to see them live.
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 group-hover:underline">
                      Unlock
                      <span
                        className="material-symbols-outlined text-[14px]"
                        aria-hidden="true"
                      >
                        arrow_forward
                      </span>
                    </span>
                  </button>
                ) : list.length === 0 ? (
                  <div className="rounded-xl border border-dashed dark:border-white/10 light:border-slate-200 p-4 text-xs dark:text-gray-500 light:text-slate-400 text-center">
                    No {col.label} alignments right now.
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
