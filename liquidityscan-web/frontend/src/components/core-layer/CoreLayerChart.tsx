import React, { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createChart, ColorType, type Time } from 'lightweight-charts';
import { useTheme } from '../../contexts/ThemeContext';
import { shouldShowDirectionWarning } from '../../core-layer/helpers';
import { fetchCandles, type ChartCandle } from '../../services/candles';
import type { CoreLayerVariant, Direction, TF, TFLifeState } from '../../core-layer/types';

interface CoreLayerChartProps {
  pair: string;
  tf: TF;
  direction: Direction;
  /**
   * Chain variant. Drives the per-variant direction-warning rule on the
   * signal bar: SE requires a directionally-matching close, CRT/BIAS do
   * not (both can legitimately fire on either candle color).
   */
  variant: CoreLayerVariant;
  /**
   * Close-time of the signal candle on this TF (epoch ms) — the last
   * aligned candle that Core-Layer considers definitive on this TF.
   * Used to pin a highlight marker on the matching bar.
   */
  signalCloseMs?: number | null;
  /**
   * Life state for the marker color: `fresh` → green, `breathing` → amber,
   * `steady` → muted gray. Also drives the signal-candle's position inside
   * the 15-bar window so the viewer can always see post-signal continuation.
   */
  lifeState?: TFLifeState;
  /**
   * Breathing sub-phase (1 or 2). Null when not breathing. Used alongside
   * `lifeState` to shift the signal candle one bar further from the right
   * edge as the signal ages.
   */
  breathingPhase?: 1 | 2 | null;
  /**
   * Max candles fetched. The chart keeps a 15-bar window and positions the
   * signal inside it based on `lifeState` (see §14 of the spec).
   */
  candleCount?: number;
  className?: string;
}

const TF_TO_INTERVAL: Record<TF, string> = {
  W: '1w',
  '1D': '1d',
  '4H': '4h',
  '1H': '1h',
  '15m': '15m',
  '5m': '5m',
};

const TF_INTERVAL_MS: Record<TF, number> = {
  W: 7 * 24 * 60 * 60 * 1000,
  '1D': 24 * 60 * 60 * 1000,
  '4H': 4 * 60 * 60 * 1000,
  '1H': 60 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '5m': 5 * 60 * 1000,
};

const MARKER_COLOR: Record<TFLifeState, string> = {
  fresh: '#13ec37',
  breathing: '#f59e0b',
  steady: '#9ca3af',
};

const UP_COLOR = '#13ec37';
const DOWN_COLOR = '#ff4444';
// Warning tint used when the signal candle's close contradicts the chain's
// declared direction *for a variant whose pattern requires a matching close*.
// SE only — CRT and BIAS permit either body color on the signal bar.
const WARN_COLOR = '#f97316';

/**
 * Target index for the signal candle inside the 15-bar window (0-indexed,
 * where 14 = rightmost). Values track spec §14's recommendation so the
 * viewer sees more post-signal continuation as a signal ages.
 */
function pickSignalPosition(
  lifeState: TFLifeState,
  breathingPhase: 1 | 2 | null,
): number {
  if (lifeState === 'fresh') return 14;
  if (lifeState === 'breathing') return breathingPhase === 2 ? 12 : 13;
  return 12; // steady (and HTF-overridden W/1D)
}

/**
 * Interactive candlestick mini-chart for Core-Layer pair-detail tiles,
 * built on `lightweight-charts` (same engine as the full InteractiveLiveChart
 * on SignalDetails) but scoped to ~15 bars for a compact at-a-glance view.
 *
 * Behaviour:
 *  - Fetches 30 recent real candles via `fetchCandles(pair, TF→interval)`,
 *    cached per (pair, tf) by TanStack Query.
 *  - Renders the 7-before / signal / ~7-after window centered on the
 *    signal candle (or the last 15 candles when no signal is identified).
 *  - User can pan (drag) and zoom (wheel / pinch) within the fetched
 *    window. Auto-resizes to its flex-sized container.
 *  - A colored arrow marker is pinned on the signal candle, colored by
 *    life-state; signal candle itself uses `direction` color (BUY green,
 *    SELL red) versus the muted up/down for context candles.
 *
 * No overlays (no entry / SL / TP) per ADR D6 — Core-Layer is not a trade
 * signal, just an alignment surface.
 */
export const CoreLayerChart: React.FC<CoreLayerChartProps> = ({
  pair,
  tf,
  direction,
  variant,
  signalCloseMs = null,
  lifeState = 'steady',
  breathingPhase = null,
  candleCount = 30,
  className = '',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const interval = TF_TO_INTERVAL[tf];

  const query = useQuery({
    queryKey: ['core-layer-chart', pair, interval, candleCount],
    queryFn: () => fetchCandles(pair, interval, candleCount),
    enabled: Boolean(pair) && Boolean(interval),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const { windowCandles, signalIdx } = useMemo(() => {
    const raw = query.data ?? [];
    if (raw.length === 0) return { windowCandles: [], signalIdx: -1 };

    let sig = -1;
    if (signalCloseMs != null) {
      const intervalMs = TF_INTERVAL_MS[tf];
      const targetOpen = signalCloseMs - intervalMs;
      const tol = intervalMs / 2;
      for (let i = 0; i < raw.length; i++) {
        const t = new Date(raw[i].openTime).getTime();
        if (Math.abs(t - targetOpen) <= tol) {
          sig = i;
          break;
        }
      }
    }

    // Spec §14 — 15-bar window with the signal candle positioned by life state
    // so post-signal continuation is always visible in proportion to how fresh
    // the signal is:
    //   fresh                → position 14 (rightmost, 0 post-candles)
    //   breathing phase 1/2  → position 13 (1 post-candle)
    //   breathing phase 2/2  → position 12 (2 post-candles)
    //   steady               → position 12 (2 post-candles, continuation context)
    // HTF override: W and 1D render life-state = 'steady' per spec §7, so they
    // naturally fall into the 2-post-candle layout.
    const WINDOW = 15;
    const targetPos = pickSignalPosition(lifeState, breathingPhase);
    let start: number;
    let end: number;
    if (sig >= 0) {
      start = Math.max(0, sig - targetPos);
      end = Math.min(raw.length, start + WINDOW);
      start = Math.max(0, end - WINDOW);
    } else {
      end = raw.length;
      start = Math.max(0, end - WINDOW);
    }
    const slice = raw.slice(start, end);
    const sigInSlice = sig >= 0 ? sig - start : -1;
    return { windowCandles: slice, signalIdx: sigInSlice };
  }, [query.data, signalCloseMs, tf, lifeState, breathingPhase]);

  return (
    <ChartBody
      candles={windowCandles}
      signalIdx={signalIdx}
      isDark={isDark}
      variant={variant}
      direction={direction}
      markerColor={MARKER_COLOR[lifeState]}
      loading={query.isLoading}
      className={className}
    />
  );
};

interface ChartBodyProps {
  candles: ChartCandle[];
  signalIdx: number;
  isDark: boolean;
  variant: CoreLayerVariant;
  direction: Direction;
  markerColor: string;
  loading: boolean;
  className: string;
}

const ChartBody: React.FC<ChartBodyProps> = ({
  candles,
  signalIdx,
  isDark,
  variant,
  direction,
  markerColor,
  loading,
  className,
}) => {
  const isLong = direction === 'BUY';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#9ca3af' : '#64748b',
        fontSize: 10,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
          style: 1,
          visible: true,
        },
        horzLines: {
          color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
          style: 1,
          visible: true,
        },
      },
      width: container.clientWidth || 240,
      height: container.clientHeight || 200,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
        rightOffset: 2,
        barSpacing: 10,
        minBarSpacing: 4,
      },
      rightPriceScale: {
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
          width: 1,
          style: 1,
          labelBackgroundColor: '#13ec37',
        },
        horzLine: {
          color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
          width: 1,
          style: 1,
          labelBackgroundColor: '#13ec37',
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderVisible: false,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!chartRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w > 0 && h > 0) {
        chartRef.current.applyOptions({ width: w, height: h });
      }
    });
    ro.observe(container);

    return () => {
      try {
        ro.disconnect();
      } catch {
        /* ignore */
      }
      try {
        chart.remove();
      } catch {
        /* ignore */
      }
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [isDark]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    if (candles.length === 0) {
      try {
        series.setData([]);
        series.setMarkers([]);
      } catch {
        /* ignore */
      }
      return;
    }

    const data = candles.map((c) => ({
      time: (Math.floor(new Date(c.openTime).getTime() / 1000) as unknown) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    try {
      series.setData(data);
    } catch {
      /* ignore */
    }

    if (signalIdx >= 0 && signalIdx < data.length) {
      // Direction-coherence check, variant-aware. SE requires the signal
      // candle's body color to match the chain direction; CRT and BIAS do
      // not enforce a body-color rule on the signal bar. See
      // `shouldShowDirectionWarning` for the per-variant contract.
      const sig = candles[signalIdx];
      const warn = shouldShowDirectionWarning(variant, direction, {
        open: sig.open,
        close: sig.close,
      });
      const marker = {
        time: data[signalIdx].time,
        position: isLong ? ('belowBar' as const) : ('aboveBar' as const),
        color: warn ? WARN_COLOR : markerColor,
        shape: (isLong ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text: warn ? 'SIGNAL ⚠' : 'SIGNAL',
        size: 1.2,
      };
      try {
        series.setMarkers([marker]);
      } catch {
        /* ignore */
      }
    } else {
      try {
        series.setMarkers([]);
      } catch {
        /* ignore */
      }
    }

    try {
      chart.timeScale().fitContent();
    } catch {
      /* ignore */
    }
  }, [candles, signalIdx, variant, direction, markerColor]);

  return (
    <div
      className={`relative w-full h-full flex-1 min-h-[160px] rounded-lg overflow-hidden dark:bg-black/20 light:bg-white/80 ${className}`}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {loading && candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
        </div>
      )}
      {!loading && candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-2xl dark:text-gray-600 light:text-slate-400">
            show_chart
          </span>
          <span className="text-[11px] font-mono dark:text-gray-500 light:text-slate-400">
            No candles yet
          </span>
        </div>
      )}
    </div>
  );
};
