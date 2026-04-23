import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CoreLayerChart } from './CoreLayerChart';
import { LifeStatePill } from './LifeStatePill';
import { TradingViewWidget } from '../TradingViewWidget';
import { useTheme } from '../../contexts/ThemeContext';
import { computeBreathingPhase } from '../../core-layer/helpers';
import { MOCK_NOW } from '../../core-layer/constants';
import type { CoreLayerSignal, TF, TFLifeState } from '../../core-layer/types';

interface Props {
  signal: CoreLayerSignal;
  tf: TF;
  /**
   * Max number of real candles fetched and rendered. Default 30 matches
   * the monitor-page mini charts.
   */
  candleCount?: number;
  /**
   * Reference "now" for time-ago and breathing-phase math. Defaults to
   * `MOCK_NOW` so the mock-data preview renders deterministically with
   * its own epoch. Phase 5 live data passes `Date.now()` so the header's
   * "12m ago" tracks wall-clock.
   */
  now?: number;
}

/**
 * One tile of the pair-detail responsive grid — a per-TF chart surrounded by
 * a header (TF name · life pill · pattern kind · TV-toggle · time ago) and a
 * footer (drag/scroll hint · "Open in TradingView ↗"). Border color is
 * derived from the TF's life state and breathing sub-phase.
 *
 * The chart body has two modes, toggled per-tile by the header button:
 *   - Native (default): `CoreLayerChart` — lightweight-charts mini with the
 *     signal candle highlighted (matches scanner monitors' visual language).
 *   - TradingView: full TV iframe widget for the same symbol + TF. No signal
 *     marker (TV is its own world), but full TV toolbar / studies available.
 */
export const CoreLayerChartTile: React.FC<Props> = ({
  signal,
  tf,
  candleCount = 30,
  now = MOCK_NOW,
}) => {
  const state: TFLifeState = signal.tfLifeState[tf] ?? 'steady';
  const tfClose = signal.tfLastCandleClose[tf] ?? now;
  const phase = computeBreathingPhase(tf, tfClose, now);
  const patternKind = signal.variant === 'SE' ? signal.sePerTf?.[tf] : undefined;
  const timeAgo = formatTimeAgo(now - tfClose);
  const showPill = state === 'fresh' || state === 'breathing';

  const tfBadgeClass = tfBadge(state, phase);

  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showTradingView, setShowTradingView] = useState(false);

  return (
    <div
      className={`group aspect-square rounded-xl p-3 flex flex-col gap-2 dark:bg-[#0d1310]/80 light:bg-white/90 backdrop-blur-sm transition-all duration-200 hover:shadow-glow ${borderClass(
        state,
        phase,
      )}`}
    >
      <header className="flex items-center justify-between gap-2 min-w-0 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono font-black tracking-wider leading-none border ${tfBadgeClass}`}
          >
            {tf}
          </span>
          {showPill && <LifeStatePill state={state} />}
          {patternKind && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border dark:border-white/10 light:border-slate-200 dark:bg-white/[0.04] light:bg-slate-50 dark:text-gray-300 light:text-slate-600 tracking-wider leading-none">
              {patternKind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Source toggle — Native (lightweight-charts) ↔ TradingView iframe.
              Mirrors the InteractiveLiveChart toolbar button used by the
              SignalDetails page so the affordance is familiar to users who
              already know the scanner monitors. */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setShowTradingView((s) => !s)}
            aria-pressed={showTradingView}
            title={showTradingView ? 'Switch to native chart' : 'Switch to TradingView'}
            className={`inline-flex items-center justify-center p-1 rounded-md transition-all duration-200 border ${
              showTradingView
                ? 'bg-primary/15 text-primary border-primary/40 shadow-[0_0_8px_-2px_rgba(19,236,55,0.45)]'
                : 'dark:bg-white/[0.04] light:bg-slate-50 dark:border-white/10 light:border-slate-200 dark:text-gray-300 light:text-slate-600 hover:text-primary hover:border-primary/30'
            }`}
          >
            {showTradingView ? (
              <span className="material-symbols-outlined text-[14px]">candlestick_chart</span>
            ) : (
              <svg
                className="w-[14px] h-[14px]"
                viewBox="0 0 42 29"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path d="M12.981 0L19.227 8H6.73501L12.981 0Z" />
                <path d="M21.246 0L39.981 24H2.511L21.246 0Z" />
                <path opacity="0.6" d="M37.746 19L41.981 29H13.491L17.726 19H37.746Z" />
              </svg>
            )}
          </motion.button>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono dark:text-gray-500 light:text-slate-400 whitespace-nowrap">
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            {timeAgo}
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden">
        {showTradingView ? (
          <TradingViewWidget
            symbol={signal.pair}
            interval={tvInterval(tf)}
            theme={isDark ? 'dark' : 'light'}
            height="100%"
          />
        ) : (
          <CoreLayerChart
            pair={signal.pair}
            tf={tf}
            direction={signal.direction}
            variant={signal.variant}
            signalCloseMs={signal.tfLastCandleClose[tf] ?? null}
            candleCount={candleCount}
            lifeState={state}
            breathingPhase={phase}
          />
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 text-[10px] font-mono shrink-0">
        <span className="inline-flex items-center gap-1 dark:text-gray-500 light:text-slate-400">
          <span className="material-symbols-outlined text-[12px]">
            {showTradingView ? 'public' : 'drag_indicator'}
          </span>
          {showTradingView ? 'TradingView · live' : 'drag / scroll'}
        </span>
        <a
          href={tvUrl(signal.pair, tf)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold dark:text-gray-300 light:text-slate-600 hover:text-primary transition-colors"
        >
          Open in TradingView
          <span className="material-symbols-outlined text-[12px] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            north_east
          </span>
        </a>
      </footer>
    </div>
  );
};

function tfBadge(state: TFLifeState, phase: 1 | 2 | null): string {
  if (state === 'fresh') return 'bg-primary/15 text-primary border-primary/40';
  if (state === 'breathing') {
    return phase === 2
      ? 'bg-amber-700/15 text-amber-300 border-amber-700/50'
      : 'bg-amber-400/15 text-amber-400 border-amber-400/40';
  }
  return 'dark:bg-white/[0.04] light:bg-slate-100 dark:text-white light:text-slate-900 dark:border-white/10 light:border-slate-200';
}

function borderClass(state: TFLifeState, phase: 1 | 2 | null): string {
  if (state === 'fresh') {
    return 'border-2 border-primary/70 shadow-[0_0_0_1px_rgba(19,236,55,0.15)]';
  }
  if (state === 'breathing') {
    if (phase === 2) return 'border-2 border-amber-700/70';
    return 'border-2 border-amber-400/70';
  }
  return 'border dark:border-white/10 light:border-slate-200';
}

function formatTimeAgo(ms: number): string {
  const abs = Math.max(0, ms);
  const minutes = Math.floor(abs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Map our TF to TradingView interval query-param. */
function tvInterval(tf: TF): string {
  switch (tf) {
    case 'W':
      return 'W';
    case '1D':
      return 'D';
    case '4H':
      return '240';
    case '1H':
      return '60';
    case '15m':
      return '15';
    case '5m':
      return '5';
  }
}

function tvUrl(pair: string, tf: TF): string {
  return `https://www.tradingview.com/chart/?symbol=BINANCE:${pair}&interval=${tvInterval(tf)}`;
}
