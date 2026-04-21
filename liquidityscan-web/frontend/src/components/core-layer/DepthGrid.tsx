import React from 'react';
import type { CoreLayerSignal } from '../../core-layer/types';
import { DEPTH_COLUMNS } from '../../core-layer/constants';
import { SignalCard } from './SignalCard';

interface DepthGridProps {
  signals: CoreLayerSignal[];
  /** Optional set of signal IDs to pulse with the promotion animation. */
  justPromotedIds?: Set<string>;
  className?: string;
}

/**
 * 3-column grid: 2-deep / 3-deep / 4-deep (see spec line 108). The 5-deep
 * column ships in Phase 7 when sub-hour TFs unlock — `DEPTH_COLUMNS` is the
 * single source of truth so Phase 7 is a data edit, not a component change.
 *
 * Mobile: horizontal scroll-snap one column at a time below md (spec line 236).
 */
export const DepthGrid: React.FC<DepthGridProps> = ({
  signals,
  justPromotedIds,
  className = '',
}) => {
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
    <div
      className={`flex md:grid md:grid-cols-3 gap-4 overflow-x-auto snap-x snap-mandatory md:overflow-visible pb-2 ${className}`}
    >
      {DEPTH_COLUMNS.map((col) => {
        const list = grouped.get(col.depth) ?? [];
        return (
          <section
            key={col.depth}
            className="shrink-0 w-[85vw] md:w-auto snap-start flex flex-col gap-3"
            aria-label={`${col.label} column`}
          >
            <header className="flex items-center justify-between px-1">
              <h3 className="text-sm font-black dark:text-white light:text-slate-900 tracking-wide">
                {col.label}
              </h3>
              <span className="text-[10px] font-mono font-bold dark:text-gray-500 light:text-slate-400 uppercase tracking-wider">
                {list.length} signal{list.length === 1 ? '' : 's'}
              </span>
            </header>
            <p className="px-1 text-[10px] dark:text-gray-500 light:text-slate-400">
              {col.blurb}
            </p>
            <div className="flex flex-col gap-3">
              {list.length === 0 ? (
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
  );
};
