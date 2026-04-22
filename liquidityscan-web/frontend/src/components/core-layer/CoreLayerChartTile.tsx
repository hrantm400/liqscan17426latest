import React from 'react';
import { CoreLayerChart } from './CoreLayerChart';
import { LifeStatePill } from './LifeStatePill';
import { computeBreathingPhase } from '../../core-layer/helpers';
import { MOCK_NOW } from '../../core-layer/constants';
import type { CoreLayerSignal, TF, TFLifeState } from '../../core-layer/types';

interface Props {
  signal: CoreLayerSignal;
  tf: TF;
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
 * All static — no motion anywhere in the tile per Phase 1 redesign spec.
 */
export const CoreLayerChartTile: React.FC<Props> = ({ signal, tf, candleCount = 7, now = MOCK_NOW }) => {
  const state: TFLifeState = signal.tfLifeState[tf] ?? 'steady';
  const tfClose = signal.tfLastCandleClose[tf] ?? now;
  const phase = computeBreathingPhase(tf, tfClose, now);
  const patternKind = signal.variant === 'SE' ? signal.sePerTf?.[tf] : undefined;
  const timeAgo = formatTimeAgo(now - tfClose);
  const showPill = state === 'fresh' || state === 'breathing';

  return (
    <div
      className={`rounded-xl p-3 flex flex-col gap-2 dark:bg-black/30 light:bg-white/90 ${borderClass(
        state,
        phase,
      )}`}
    >
      <header className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[13px] font-black dark:text-white light:text-slate-900 font-mono">
            {tf}
          </span>
          {showPill && <LifeStatePill state={state} />}
          {patternKind && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border dark:border-white/10 light:border-slate-200 dark:text-gray-300 light:text-slate-600 tracking-wider">
              {patternKind}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono dark:text-gray-500 light:text-slate-400 whitespace-nowrap">
          {timeAgo}
        </span>
      </header>

      <CoreLayerChart
        pair={signal.pair}
        tf={tf}
        direction={signal.direction}
        seedPrice={signal.price > 0 ? signal.price : 100}
        candleCount={candleCount}
        lifeState={state}
      />

      <footer className="flex items-center justify-between gap-2 text-[10px] font-mono">
        <span className="dark:text-gray-500 light:text-slate-400">{candleCount} candles</span>
        <a
          href={tvUrl(signal.pair, tf)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold dark:text-gray-300 light:text-slate-600 hover:text-primary transition-colors"
        >
          Open in TradingView
          <span className="material-symbols-outlined text-[12px]">north_east</span>
        </a>
      </footer>
    </div>
  );
};

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
