import React, { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  init,
  dispose,
  LineType,
  TooltipShowRule,
  type Chart,
  type DeepPartial,
  type KLineData,
  type Styles,
} from 'klinecharts';
import { useTheme } from '../../contexts/ThemeContext';
import { shouldShowDirectionWarning } from '../../core-layer/helpers';
import { findFormingCandleIdx } from '../../core-layer/chart-forming';
import { registerExtensions } from '../../core-layer/kline-extensions';
import { fetchCandles, type ChartCandle } from '../../services/candles';
import type { CoreLayerVariant, Direction, TF, TFLifeState } from '../../core-layer/types';

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
const WARN_COLOR = '#f97316';

/* ────────────── component ────────────── */

interface CoreLayerChartProps {
  pair: string;
  tf: TF;
  direction: Direction;
  variant: CoreLayerVariant;
  signalCloseMs?: number | null;
  lifeState?: TFLifeState;
  breathingPhase?: 1 | 2 | null;
  candleCount?: number;
  className?: string;
}

function pickSignalPosition(
  lifeState: TFLifeState,
  breathingPhase: 1 | 2 | null,
): number {
  if (lifeState === 'fresh') return 14;
  if (lifeState === 'breathing') return breathingPhase === 2 ? 12 : 13;
  return 12;
}

/**
 * Mini klinecharts candle tile rendered inside each `CoreLayerChartTile`
 * — one per timeframe in the pair-detail responsive grid. Renders the
 * highlighted signal candle plus a few bars of context, with theme +
 * lifestate-driven coloring.
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

  const { windowCandles, signalIdx, formingIdx } = useMemo(() => {
    const raw = query.data ?? [];
    if (raw.length === 0) return { windowCandles: [], signalIdx: -1, formingIdx: -1 };

    const intervalMs = TF_INTERVAL_MS[tf];

    let sig = -1;
    if (signalCloseMs != null) {
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
    const formingInSlice = findFormingCandleIdx(slice, intervalMs, Date.now());
    return { windowCandles: slice, signalIdx: sigInSlice, formingIdx: formingInSlice };
  }, [query.data, signalCloseMs, tf, lifeState, breathingPhase]);

  return (
    <KlineChartBody
      candles={windowCandles}
      signalIdx={signalIdx}
      formingIdx={formingIdx}
      isDark={isDark}
      variant={variant}
      direction={direction}
      markerColor={MARKER_COLOR[lifeState]}
      loading={query.isLoading}
      className={className}
      tf={tf}
    />
  );
};

interface KlineChartBodyProps {
  candles: ChartCandle[];
  signalIdx: number;
  formingIdx: number;
  isDark: boolean;
  variant: CoreLayerVariant;
  direction: Direction;
  markerColor: string;
  loading: boolean;
  className: string;
  tf: TF;
}

function buildStyles(isDark: boolean): DeepPartial<Styles> {
  return {
    candle: {
      bar: {
        upColor: UP_COLOR,
        downColor: DOWN_COLOR,
        noChangeColor: UP_COLOR,
        upBorderColor: UP_COLOR,
        downBorderColor: DOWN_COLOR,
        noChangeBorderColor: UP_COLOR,
        upWickColor: UP_COLOR,
        downWickColor: DOWN_COLOR,
        noChangeWickColor: UP_COLOR,
      },
      tooltip: { showRule: TooltipShowRule.None },
      priceMark: {
        last: { show: false },
        high: { show: false },
        low: { show: false },
      },
    },
    grid: {
      horizontal: {
        color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
        style: LineType.Dashed,
        dashedValue: [2, 2],
      },
      vertical: {
        color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
        style: LineType.Dashed,
        dashedValue: [2, 2],
      },
    },
    xAxis: {
      axisLine: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' },
      tickLine: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' },
      tickText: { color: isDark ? '#9ca3af' : '#64748b', size: 10 },
    },
    yAxis: {
      axisLine: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' },
      tickLine: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' },
      tickText: { color: isDark ? '#9ca3af' : '#64748b', size: 10 },
    },
    crosshair: {
      horizontal: {
        line: { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)' },
        text: { backgroundColor: '#13ec37' },
      },
      vertical: {
        line: { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)' },
        text: { backgroundColor: '#13ec37' },
      },
    },
    separator: { color: 'transparent' },
  };
}

const KlineChartBody: React.FC<KlineChartBodyProps> = ({
  candles,
  signalIdx,
  formingIdx,
  isDark,
  variant,
  direction,
  markerColor,
  loading,
  className,
  tf,
}) => {
  const isLong = direction === 'BUY';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const overlayIdsRef = useRef<string[]>([]);

  // One-time chart construction. Theme changes re-skin via setStyles below
  // (no need to tear down + recreate, per feasibility check bonus).
  useEffect(() => {
    registerExtensions();
    const container = containerRef.current;
    if (!container) return;

    const chart = init(container, { styles: buildStyles(isDark) });
    if (!chart) return;
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    ro.observe(container);

    return () => {
      try {
        ro.disconnect();
      } catch {
        /* ignore */
      }
      try {
        dispose(container);
      } catch {
        /* ignore */
      }
      chartRef.current = null;
      overlayIdsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme switch — recolor in place without recreating the chart.
  useEffect(() => {
    chartRef.current?.setStyles(buildStyles(isDark));
  }, [isDark]);

  // Data + overlays update.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Clear previous overlays before drawing new ones — klinecharts overlay ids
    // are unique per createOverlay call, so we track and remove ours explicitly.
    for (const id of overlayIdsRef.current) {
      try {
        chart.removeOverlay(id);
      } catch {
        /* ignore */
      }
    }
    overlayIdsRef.current = [];

    if (candles.length === 0) {
      try {
        chart.applyNewData([]);
      } catch {
        /* ignore */
      }
      return;
    }

    const data: KLineData[] = candles.map((c) => ({
      timestamp: new Date(c.openTime).getTime(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    try {
      chart.applyNewData(data);
    } catch {
      /* ignore */
    }

    // Forming-candle tint as an overlay (not an indicator — see
    // registerExtensions for why). Anchor on the forming bar's close price;
    // the overlay's createPointFigures only uses the timestamp for x and
    // ignores y entirely, but klinecharts requires a numeric `value`.
    if (formingIdx >= 0 && formingIdx < data.length) {
      const id = chart.createOverlay({
        name: 'cl-forming',
        points: [
          {
            timestamp: data[formingIdx].timestamp,
            value: candles[formingIdx].close,
          },
        ],
      });
      if (typeof id === 'string' && id) overlayIdsRef.current.push(id);
    }

    if (signalIdx >= 0 && signalIdx < data.length) {
      const sig = candles[signalIdx];
      const warn = shouldShowDirectionWarning(variant, direction, {
        open: sig.open,
        close: sig.close,
      });
      const arrowColor = warn ? WARN_COLOR : markerColor;
      const text = warn ? 'SIGNAL ⚠' : 'SIGNAL';
      // anchor below the bar for BUY (arrow points up), above for SELL.
      const anchorPrice = isLong ? sig.low : sig.high;
      const id = chart.createOverlay({
        name: 'cl-signal',
        points: [{ timestamp: data[signalIdx].timestamp, value: anchorPrice }],
        extendData: { dir: isLong ? 'up' : 'down', color: arrowColor, text },
      });
      if (typeof id === 'string' && id) overlayIdsRef.current.push(id);
    }

    // Day separators on sub-daily TFs only — same convention as the LW chart.
    if (tf !== 'W' && tf !== '1D') {
      const DAY_MS = 86_400_000;
      for (const c of data) {
        if (c.timestamp % DAY_MS !== 0) continue;
        // anchor value is irrelevant — the dayline figure ignores y.
        const id = chart.createOverlay({
          name: 'cl-dayline',
          points: [{ timestamp: c.timestamp, value: candles[0].open }],
        });
        if (typeof id === 'string' && id) overlayIdsRef.current.push(id);
      }
    }
  }, [candles, signalIdx, formingIdx, variant, direction, markerColor, tf, isLong]);

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
