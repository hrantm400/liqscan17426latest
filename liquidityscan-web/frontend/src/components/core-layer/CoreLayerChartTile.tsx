import React from 'react';
import { CoreLayerChart } from './CoreLayerChart';
import { LifeStatePill } from './LifeStatePill';
import { computeBreathingPhase } from '../../core-layer/helpers';
import { MOCK_NOW } from '../../core-layer/constants';
import type { CoreLayerSignal, TF, TFLifeState } from '../../core-layer/types';

interface Props {
  signal: CoreLayerSignal;
  tf: TF;
  /**
   * Max number of real candles fetched and rendered. Default 40 matches
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
 * One tile of the pair-detail responsive grid — a per-TF chart surrounded by a
 * header (TF name · life pill · pattern kind · time ago) and a footer (candle
 * count · "Open in TradingView ↗"). Border color is derived from the TF's
 * life state and breathing sub-phase:
 *
 *   - fresh               → green border  (primary/70)
 *   - breathing phase 1/2 → yellow-amber (amber-400/70)
 *   - breathing phase 2/2 → darker amber (amber-700/70)
 *   - steady              → default hairline (matches existing cards)
 *
 * The chart body itself is `CoreLayerChart`, which fetches real OHLCV
 * from `GET /candles/:symbol/:interval` and renders a mini-candlestick
 * matching the scanner monitors' visual language. The signal candle
 * (the one whose close matches `signal.tfLastCandleClose[tf]`) is
 * highlighted so the viewer can see where the alignment fired.
 */
export const CoreLayerChartTile: React.FC<Props> = ({ signal, tf, candleCount = 30, now = MOCK_NOW }) => {
  const state: TFLifeState = signal.tfLifeState[tf] ?? 'steady';
  const tfClose = signal.tfLastCandleClose[tf] ?? now;
  const phase = computeBreathingPhase(tf, tfClose, now);
  const patternKind = signal.variant === 'SE' ? signal.sePerTf?.[tf] : undefined;
  const timeAgo = formatTimeAgo(now - tfClose);
  const showPill = state === 'fresh' || state === 'breathing';

  const tfBadgeClass = tfBadge(state, phase);

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
        <span className="inline-flex items-center gap-1 text-[10px] font-mono dark:text-gray-500 light:text-slate-400 whitespace-nowrap">
          <span className="material-symbols-outlined text-[12px]">schedule</span>
          {timeAgo}
        </span>
      </header>

      <div className="flex-1 min-h-0 relative">
        <CoreLayerChart
          pair={signal.pair}
          tf={tf}
          direction={signal.direction}
          variant={signal.variant}
          signalCloseMs={signal.tfLastCandleClose[tf] ?? null}
          candleCount={candleCount}
          lifeState={state}
        />
      </div>

      <footer className="flex items-center justify-between gap-2 text-[10px] font-mono shrink-0">
        <span className="inline-flex items-center gap-1 dark:text-gray-500 light:text-slate-400">
          <span className="material-symbols-outlined text-[12px]">drag_indicator</span>
          drag / scroll
        </span>
        <a
          href={tvUrl(signal.pair, tf)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold dark:text-gray-300 light:text-slate-600 hover:text-primary transition-colors"
        >
          TradingView
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
