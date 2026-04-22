import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { CoreLayerSignal } from '../../core-layer/types';
import { VARIANT_META } from '../../core-layer/constants';
import { deepestTf } from '../../core-layer/helpers';
import { LifeStatePill } from './LifeStatePill';
import { CorrelationBadge } from './CorrelationBadge';
import { PlusBadge } from './PlusBadge';

interface SignalCardProps {
  signal: CoreLayerSignal;
  /** When true, fires the one-shot promotion animation ring. Parent decides. */
  isJustPromoted?: boolean;
  className?: string;
}

/**
 * Depth-grid card for a single Core-Layer signal. Per spec:
 *   - Fresh indicator never shown on grid cards (line 137)
 *   - Breathing indicator only when the DEEPEST TF is breathing (line 136)
 *   - That deepest TF is highlighted amber inline in the chain string
 *   - Base vs Pro rendering diff is zero in v1 (sub-1h unlock in Phase 7)
 *
 * In v1 mock data, `correlationPairs` populates only with `1D+1H` — the UI
 * does not filter further. Base users never reach Pro-gated pairs because
 * they're intercepted upstream by the pair-detail upgrade modal.
 */
export const SignalCard: React.FC<SignalCardProps> = ({
  signal,
  isJustPromoted,
  className = '',
}) => {
  const variant = VARIANT_META[signal.variant];
  const deepest = deepestTf(signal.chain);
  const deepestState = deepest ? signal.tfLifeState[deepest] : undefined;
  const deepestIsBreathing = deepestState === 'breathing';

  const directionColor = signal.direction === 'BUY' ? 'text-primary' : 'text-red-400';
  const directionIcon = signal.direction === 'BUY' ? 'trending_up' : 'trending_down';
  const change24hColor = signal.change24h >= 0 ? 'text-primary' : 'text-red-400';

  const href = `/core-layer/${variant.urlSlug}/${signal.pair}`;

  return (
    <motion.div
      initial={isJustPromoted ? { scale: 0.96, boxShadow: '0 0 0 rgba(19,236,55,0)' } : false}
      animate={
        isJustPromoted
          ? {
              scale: [1, 1.02, 1],
              boxShadow: [
                '0 0 0 rgba(19,236,55,0)',
                '0 0 24px rgba(19,236,55,0.5)',
                '0 0 0 rgba(19,236,55,0)',
              ],
            }
          : {}
      }
      transition={{ duration: 1.2, ease: 'easeOut' }}
      className={className}
    >
      <Link
        to={href}
        aria-label={`${signal.pair} ${signal.direction} ${signal.depth}-deep ${signal.variant} alignment`}
        className="block rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/80 backdrop-blur-sm dark:hover:border-primary/40 light:hover:border-primary/40 dark:hover:bg-white/[0.05] light:hover:bg-white transition-colors p-4 space-y-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`material-symbols-outlined text-[18px] ${directionColor}`}>
              {directionIcon}
            </span>
            <span className="font-black text-base dark:text-white light:text-slate-900 tracking-wide truncate">
              {signal.pair}
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                signal.direction === 'BUY'
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-red-500/10 text-red-400 border-red-500/30'
              }`}
            >
              {signal.direction}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {signal.plusSummary && <PlusBadge summary={signal.plusSummary} />}
            {deepestIsBreathing && deepestState && <LifeStatePill state={deepestState} compact />}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="font-mono tracking-wider dark:text-gray-300 light:text-slate-600">
            {signal.chain.map((tf, i) => {
              const highlight = deepestIsBreathing && tf === deepest;
              return (
                <React.Fragment key={tf}>
                  <span className={highlight ? 'text-amber-400 font-bold' : ''}>{tf}</span>
                  {i < signal.chain.length - 1 && (
                    <span className="dark:text-gray-600 light:text-slate-400"> · </span>
                  )}
                </React.Fragment>
              );
            })}
          </span>
          <span className="text-[10px] font-bold dark:text-gray-400 light:text-slate-500 uppercase tracking-wider">
            {signal.depth}-deep
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            {signal.correlationPairs.map(([a, b]) => (
              <CorrelationBadge key={`${a}-${b}`} pair={[a, b]} />
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono dark:text-gray-300 light:text-slate-600">
              {formatPrice(signal.price)}
            </span>
            <span className={`font-bold ${change24hColor}`}>
              {signal.change24h >= 0 ? '+' : ''}
              {signal.change24h.toFixed(2)}%
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

function formatPrice(n: number): string {
  if (n < 0.001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
