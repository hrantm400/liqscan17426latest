import React, { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createChart, ColorType, type Time } from 'lightweight-charts';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchCandles, type ChartCandle } from '../../services/candles';
import type { Direction, TF, TFLifeState } from '../../core-layer/types';

interface CoreLayerChartProps {
  pair: string;
  tf: TF;
  direction: Direction;
  /**
   * Close-time of the signal candle on this TF (epoch ms) — the last
   * aligned candle that Core-Layer considers definitive on this TF.
   * Used to pin a highlight marker on the matching bar.
   */
  signalCloseMs?: number | null;
  /**
   * Life state for the marker color: `fresh` → green, `breathing` → amber,
   * `steady` → muted gray. Defaults to `steady`.
   */
  lifeState?: TFLifeState;
  /**
   * Max candles fetched. The chart keeps a `context + signal + tail`
   * window of ~15 bars by default — 7 before, signal, 7 after (or the
   * last 15 total if no signal is identified).
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
  signalCloseMs = null,
  lifeState = 'steady',
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

    // 7 before + signal + 7 after = 15-bar window. Clamp to array bounds.
    const WINDOW = 15;
    const HALF = 7;
    let start: number;
    let end: number;
    if (sig >= 0) {
      start = Math.max(0, sig - HALF);
      end = Math.min(raw.length, start + WINDOW);
      start = Math.max(0, end - WINDOW);
    } else {
      end = raw.length;
      start = Math.max(0, end - WINDOW);
    }
    const slice = raw.slice(start, end);
    const sigInSlice = sig >= 0 ? sig - start : -1;
    return { windowCandles: slice, signalIdx: sigInSlice };
  }, [query.data, signalCloseMs, tf]);

  return (
    <ChartBody
      candles={windowCandles}
      signalIdx={signalIdx}
      isDark={isDark}
      isLong={direction === 'BUY'}
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
  isLong: boolean;
  markerColor: string;
  loading: boolean;
  className: string;
}

const ChartBody: React.FC<ChartBodyProps> = ({
  candles,
  signalIdx,
  isDark,
  isLong,
  markerColor,
  loading,
  className,
}) => {
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
      const marker = {
        time: data[signalIdx].time,
        position: isLong ? ('belowBar' as const) : ('aboveBar' as const),
        color: markerColor,
        shape: (isLong ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text: 'SIGNAL',
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
  }, [candles, signalIdx, isLong, markerColor]);

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
