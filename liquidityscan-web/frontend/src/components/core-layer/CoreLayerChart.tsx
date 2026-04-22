import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchCandles, type ChartCandle } from '../../services/candles';
import type { Direction, TF, TFLifeState } from '../../core-layer/types';

interface CoreLayerChartProps {
  pair: string;
  tf: TF;
  direction: Direction;
  /**
   * Close-time of the signal candle on this TF (epoch ms) — the last
   * aligned candle that Core-Layer considers definitive on this TF.
   * Used to highlight the matching bar in the mini chart. When null/undefined,
   * the last rendered candle is highlighted as a fallback.
   */
  signalCloseMs?: number | null;
  /** Chart body height in pixels. Default 140. */
  height?: number;
  /**
   * Life state for the highlight color: `fresh` → primary green,
   * `breathing` → amber, `steady` → muted. Defaults to `steady`.
   */
  lifeState?: TFLifeState;
  /** Max candles rendered. Default 40, clipped to whatever the API returns. */
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

const HIGHLIGHT_COLOR: Record<TFLifeState, string> = {
  fresh: '#13ec37',
  breathing: '#f59e0b',
  steady: '#9ca3af',
};

/**
 * Real-data candlestick mini-chart for Core-Layer pair-detail tiles.
 *
 * Visually mirrors `StaticMiniChart` (the component the signal scanners
 * use on Monitor* pages) so the pair-detail grid feels native alongside
 * the rest of the product, rather than the old deterministic-PRNG SVG.
 *
 * Candles are fetched once per (pair, tf) pair via `fetchCandles` and
 * cached by TanStack Query. The signal candle — identified by matching
 * the backend-supplied close timestamp against candle open-time — is
 * highlighted with a thicker body, brighter directional color, and a
 * dashed guide. Life state drives the guide color.
 */
export const CoreLayerChart: React.FC<CoreLayerChartProps> = ({
  pair,
  tf,
  direction,
  signalCloseMs = null,
  height = 140,
  lifeState = 'steady',
  candleCount = 40,
  className = '',
}) => {
  const interval = TF_TO_INTERVAL[tf];
  const query = useQuery({
    queryKey: ['core-layer-chart', pair, interval, candleCount],
    queryFn: () => fetchCandles(pair, interval, candleCount),
    enabled: Boolean(pair) && Boolean(interval),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const candles = query.data ?? [];
  const isLong = direction === 'BUY';
  const highlightColor = HIGHLIGHT_COLOR[lifeState];

  if (query.isLoading) {
    return (
      <div
        className={`rounded-lg dark:bg-black/20 light:bg-white/80 flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary/60 animate-spin" />
      </div>
    );
  }

  if (candles.length === 0) {
    return (
      <div
        className={`rounded-lg dark:bg-black/20 light:bg-white/80 flex items-center justify-center gap-2 ${className}`}
        style={{ height }}
      >
        <span className="material-symbols-outlined text-2xl dark:text-gray-600 light:text-slate-400">
          show_chart
        </span>
        <span className="text-[11px] font-mono dark:text-gray-500 light:text-slate-400">
          No candles yet
        </span>
      </div>
    );
  }

  return (
    <ChartBody
      candles={candles}
      pair={pair}
      tf={tf}
      isLong={isLong}
      signalCloseMs={signalCloseMs}
      highlightColor={highlightColor}
      height={height}
      className={className}
    />
  );
};

interface ChartBodyProps {
  candles: ChartCandle[];
  pair: string;
  tf: TF;
  isLong: boolean;
  signalCloseMs: number | null;
  highlightColor: string;
  height: number;
  className: string;
}

const ChartBody: React.FC<ChartBodyProps> = ({
  candles,
  pair,
  tf,
  isLong,
  signalCloseMs,
  highlightColor,
  height,
  className,
}) => {
  const [hovered, setHovered] = useState(false);

  const { displayCandles, signalIdx, min, max } = useMemo(() => {
    const slice = candles.slice(-40);

    let sigIdx = -1;
    if (signalCloseMs != null) {
      const intervalMs = TF_INTERVAL_MS[tf];
      const targetOpen = signalCloseMs - intervalMs;
      // Allow a half-interval tolerance — backend close-time is off by ±1
      // candle in rare clock-skew cases.
      const tolerance = intervalMs / 2;
      for (let i = 0; i < slice.length; i++) {
        const t = new Date(slice[i].openTime).getTime();
        if (Math.abs(t - targetOpen) <= tolerance) {
          sigIdx = i;
          break;
        }
      }
    }
    if (sigIdx === -1) sigIdx = slice.length - 1;

    let mn = Infinity;
    let mx = -Infinity;
    for (const c of slice) {
      if (c.low < mn) mn = c.low;
      if (c.high > mx) mx = c.high;
    }
    const pad = (mx - mn) * 0.08 || 1;
    return {
      displayCandles: slice,
      signalIdx: sigIdx,
      min: mn - pad,
      max: mx + pad,
    };
  }, [candles, tf, signalCloseMs]);

  const padding = 4;
  const bodyW = 5;
  const slot = bodyW + 2;
  const signalBodyW = 8;
  const chartW = padding * 2 + displayCandles.length * slot;
  const chartH = height - 8;
  const priceRange = max - min || 1;

  const upColor = '#13ec37';
  const downColor = '#ff4444';

  const scaleY = (p: number) =>
    padding + ((max - p) / priceRange) * (chartH - padding * 2);

  return (
    <div
      className={`relative w-full flex items-center justify-center dark:bg-black/20 light:bg-white/80 rounded-lg overflow-hidden ${className}`}
      style={{ height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        width="100%"
        height={chartH}
        viewBox={`0 0 ${chartW} ${chartH}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        {signalIdx >= 0 && (
          <line
            x1={padding + signalIdx * slot + bodyW / 2}
            x2={padding + signalIdx * slot + bodyW / 2}
            y1={padding}
            y2={chartH - padding}
            stroke={highlightColor}
            strokeWidth={0.8}
            strokeDasharray="2,3"
            opacity={0.45}
          />
        )}
        {displayCandles.map((c, i) => {
          const x = padding + i * slot + bodyW / 2;
          const isSignal = i === signalIdx;
          const bullish = c.close >= c.open;
          const bodyTop = Math.min(scaleY(c.open), scaleY(c.close));
          const bodyBottom = Math.max(scaleY(c.open), scaleY(c.close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const baseColor = bullish ? upColor : downColor;
          const color = isSignal
            ? isLong
              ? upColor
              : downColor
            : baseColor;
          const width = isSignal ? signalBodyW : bodyW;
          const opacity = isSignal ? 1 : 0.85;

          return (
            <g key={i}>
              <line
                x1={x}
                y1={scaleY(c.high)}
                x2={x}
                y2={scaleY(c.low)}
                stroke={color}
                strokeWidth={isSignal ? 1.5 : 1}
                opacity={opacity}
              />
              <rect
                x={x - width / 2}
                y={bodyTop}
                width={width}
                height={bodyHeight}
                fill={color}
                opacity={opacity}
              />
              {isSignal && (
                <rect
                  x={x - width / 2 - 1}
                  y={bodyTop - 1}
                  width={width + 2}
                  height={bodyHeight + 2}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.35}
                  rx={1}
                />
              )}
            </g>
          );
        })}
      </svg>

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute top-2 right-2 dark:bg-black/80 light:bg-white/90 text-[10px] font-mono font-bold px-2 py-1 rounded backdrop-blur-sm border dark:border-white/10 light:border-green-300 z-20 pointer-events-none drop-shadow-md flex items-center gap-1.5"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLong ? 'bg-[#13ec37]' : 'bg-[#ff4444]'
              } animate-pulse`}
            />
            <span className="dark:text-gray-300 light:text-slate-600">
              {pair} · {tf} · {displayCandles.length} candles
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
