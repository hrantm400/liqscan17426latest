import React from 'react';
import type { TF, TFLifeState } from '../../core-layer/types';
import { VISIBLE_TFS } from '../../core-layer/constants';
import { LifeStatePill } from './LifeStatePill';

interface TFStackProps {
  /** All TFs the component is aware of. v1 = 4 (W,1D,4H,1H); Phase 7 = 6. */
  tfs?: readonly TF[];
  /** TFs that are actually in this signal's chain. Others render disabled. */
  chain: TF[];
  /** Life-state per TF (may be partial — disabled TFs carry no state). */
  tfLifeState: Partial<Record<TF, TFLifeState>>;
  activeTf: TF;
  onSelect: (tf: TF) => void;
  className?: string;
}

/**
 * TF selector on the pair-detail page. v1 renders 4 cards — W, 1D, 4H, 1H —
 * because sub-1h is hidden until Phase 7. Component ALREADY supports 6 cards;
 * Phase 7 will pass `tfs` including `'15m'` and `'5m'` with no code change.
 *
 * Mobile: horizontal scroll-snap below md (spec line 237). TFs not in the
 * chain render disabled (muted, non-clickable) so users see the full ladder
 * and understand where their alignment lives.
 */
export const TFStack: React.FC<TFStackProps> = ({
  tfs = VISIBLE_TFS,
  chain,
  tfLifeState,
  activeTf,
  onSelect,
  className = '',
}) => {
  return (
    <div
      className={`flex md:grid md:grid-cols-4 gap-2 overflow-x-auto snap-x snap-mandatory md:overflow-visible pb-1 ${className}`}
      role="tablist"
      aria-label="Timeframe selector"
    >
      {tfs.map((tf) => {
        const inChain = chain.includes(tf);
        const active = tf === activeTf;
        const state = tfLifeState[tf];
        const showState =
          inChain && state && tf !== 'W' && tf !== '1D' && state !== 'steady';
        return (
          <button
            key={tf}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!inChain}
            onClick={() => inChain && onSelect(tf)}
            className={`shrink-0 w-24 md:w-auto snap-start rounded-2xl border p-3 flex flex-col items-start gap-2 transition-all ${
              active
                ? 'border-primary/40 bg-gradient-to-br from-primary/15 to-transparent shadow-[0_0_14px_rgba(19,236,55,0.2)]'
                : inChain
                  ? 'dark:border-white/10 light:border-slate-200 dark:bg-white/[0.02] light:bg-white/70 hover:border-primary/30'
                  : 'dark:border-white/5 light:border-slate-200/60 dark:bg-white/[0.01] light:bg-slate-50/60 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span
                className={`text-sm font-black tracking-wider ${
                  active
                    ? 'text-primary'
                    : inChain
                      ? 'dark:text-white light:text-slate-900'
                      : 'dark:text-gray-500 light:text-slate-400'
                }`}
              >
                {tf}
              </span>
              {!inChain && (
                <span
                  className="material-symbols-outlined text-[14px] dark:text-gray-600 light:text-slate-400"
                  title="This TF is not in the alignment chain"
                >
                  remove
                </span>
              )}
            </div>
            {showState && state && <LifeStatePill state={state} compact />}
            {inChain && !showState && (
              <span className="text-[10px] dark:text-gray-500 light:text-slate-400 uppercase tracking-wider">
                {state ?? 'steady'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
