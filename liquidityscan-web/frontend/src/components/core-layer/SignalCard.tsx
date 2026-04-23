import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { CoreLayerSignal, TF, TFLifeState } from '../../core-layer/types';
import { VARIANT_META } from '../../core-layer/constants';
import { deepestTf } from '../../core-layer/helpers';
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

  const isBuy = signal.direction === 'BUY';
  const directionColor = isBuy ? 'text-primary' : 'text-red-400';
  const directionIcon = isBuy ? 'trending_up' : 'trending_down';
  const change24hColor = signal.change24h >= 0 ? 'text-primary' : 'text-red-400';
  // Live backend (Phase 4+5) returns price=0 / change24h=0 as placeholders until
  // ticker enrichment lands (Phase 7.x).
  const hasTicker = signal.price > 0 || signal.change24h !== 0;

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
      whileHover={{ y: -2 }}
      className={className}
    >
      <Link
        to={href}
        aria-label={`${signal.pair} ${signal.direction} ${signal.depth}-deep ${signal.variant} alignment`}
        className={`group relative block overflow-hidden rounded-2xl border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.03] light:bg-white/85 backdrop-blur-sm transition-all duration-200 hover:border-primary/40 hover:shadow-glow focus:outline-none focus:ring-2 focus:ring-primary/50 ${
          isBuy
            ? 'hover:dark:bg-primary/[0.04]'
            : 'hover:dark:bg-red-500/[0.04]'
        }`}
      >
        {/* direction edge accent */}
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] ${
            isBuy ? 'bg-gradient-to-b from-primary/80 via-primary/40 to-transparent' : 'bg-gradient-to-b from-red-500/80 via-red-500/40 to-transparent'
          }`}
        />

        <div className="p-4 pl-[18px] space-y-3">
          {/* top row: pair + direction badge | depth + flags */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`material-symbols-outlined text-[20px] ${directionColor}`}>
                {directionIcon}
              </span>
              <span className="font-black text-base dark:text-white light:text-slate-900 tracking-wide truncate">
                {signal.pair}
              </span>
              <span
                className={`text-[9px] font-black uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-md border leading-none ${
                  isBuy
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
                }`}
              >
                {signal.direction}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {signal.plusSummary && <PlusBadge summary={signal.plusSummary} />}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.04] light:bg-slate-50 text-[10px] font-black tracking-wider dark:text-gray-300 light:text-slate-700">
                <span className="material-symbols-outlined text-[12px] text-primary">layers</span>
                {signal.depth}
              </span>
            </div>
          </div>

          {/* chain visualization — TF blocks colored by life state */}
          <ChainStrip
            chain={signal.chain}
            states={signal.tfLifeState}
            deepest={deepest}
            deepestIsBreathing={deepestIsBreathing}
          />

          {/* footer row: correlation badges | price + change */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {signal.correlationPairs.map(([a, b]) => (
                <CorrelationBadge key={`${a}-${b}`} pair={[a, b]} />
              ))}
              {signal.correlationPairs.length === 0 && (
                <span className="text-[10px] dark:text-gray-600 light:text-slate-400 font-mono">
                  no high-corr
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasTicker ? (
                <>
                  <span className="font-mono text-xs dark:text-gray-300 light:text-slate-600">
                    {formatPrice(signal.price)}
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${change24hColor}`}>
                    {signal.change24h >= 0 ? '+' : ''}
                    {signal.change24h.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="font-mono text-xs dark:text-gray-500 light:text-slate-400">—</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

interface ChainStripProps {
  chain: TF[];
  states: Partial<Record<TF, TFLifeState>>;
  deepest?: TF;
  deepestIsBreathing: boolean;
}

const STATE_BLOCK: Record<
  TFLifeState | 'unknown',
  { bg: string; border: string; text: string; dot: string }
> = {
  fresh: {
    bg: 'bg-primary/15',
    border: 'border-primary/40',
    text: 'text-primary',
    dot: 'bg-primary shadow-[0_0_6px_rgba(19,236,55,0.7)]',
  },
  breathing: {
    bg: 'bg-amber-500/15',
    border: 'border-amber-400/40',
    text: 'text-amber-400',
    dot: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]',
  },
  steady: {
    bg: 'dark:bg-white/[0.04] light:bg-slate-100',
    border: 'dark:border-white/10 light:border-slate-200',
    text: 'dark:text-gray-300 light:text-slate-700',
    dot: 'dark:bg-gray-500 light:bg-slate-400',
  },
  unknown: {
    bg: 'dark:bg-white/[0.02] light:bg-slate-50',
    border: 'dark:border-white/10 light:border-slate-200',
    text: 'dark:text-gray-400 light:text-slate-500',
    dot: 'dark:bg-gray-600 light:bg-slate-300',
  },
};

const ChainStrip: React.FC<ChainStripProps> = ({ chain, states, deepest, deepestIsBreathing }) => (
  <div className="flex items-center gap-1">
    {chain.map((tf, i) => {
      const state = states[tf] ?? 'unknown';
      const meta = STATE_BLOCK[state];
      const isDeepest = tf === deepest;
      const ring = isDeepest && deepestIsBreathing ? 'ring-1 ring-amber-400/50' : '';
      return (
        <React.Fragment key={tf}>
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-md border ${meta.bg} ${meta.border} ${ring} transition-colors`}
            title={`${tf} · ${state}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
            <span className={`text-[10px] font-mono font-bold ${meta.text}`}>{tf}</span>
          </div>
          {i < chain.length - 1 && (
            <span className="material-symbols-outlined text-[12px] dark:text-gray-700 light:text-slate-300">
              chevron_right
            </span>
          )}
        </React.Fragment>
      );
    })}
  </div>
);

function formatPrice(n: number): string {
  if (n < 0.001) return n.toExponential(2);
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
