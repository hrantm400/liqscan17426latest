import React, { useMemo } from 'react';
import type { Direction, TF } from '../../core-layer/types';

interface MockCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CoreLayerChartProps {
  pair: string;
  tf: TF;
  direction: Direction;
  /** Anchor price used to generate deterministic mock candles. */
  seedPrice: number;
  /** Roughly how many candles to draw. Defaults to 40. */
  candleCount?: number;
  /** Height of the SVG canvas in pixels. */
  height?: number;
  className?: string;
}

/**
 * Small SVG candlestick chart (~40 candles, pattern candle highlighted).
 * No entry / SL / TP overlays per spec line 114 — Core-Layer is not a trade
 * signal, so the chart stays informational. Candles are generated
 * deterministically from `seedPrice` so the same pair+TF always renders the
 * same chart in mock mode.
 */
export const CoreLayerChart: React.FC<CoreLayerChartProps> = ({
  pair,
  tf,
  direction,
  seedPrice,
  candleCount = 40,
  height = 180,
  className = '',
}) => {
  const candles = useMemo<MockCandle[]>(() => {
    // Deterministic PRNG seeded by pair+tf string hash so re-renders are stable.
    const seedStr = `${pair}-${tf}`;
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const out: MockCandle[] = [];
    let price = seedPrice;
    for (let i = 0; i < candleCount; i++) {
      const drift = (rand() - 0.5) * seedPrice * 0.01;
      const open = price;
      const close = price + drift;
      const high = Math.max(open, close) + rand() * seedPrice * 0.005;
      const low = Math.min(open, close) - rand() * seedPrice * 0.005;
      out.push({ time: i, open, high, low, close });
      price = close;
    }
    // Pattern candle — force directional bias on the last candle.
    const last = out[out.length - 1];
    const priorClose = out[out.length - 2]?.close ?? last.open;
    last.open = priorClose * (direction === 'BUY' ? 0.996 : 1.004);
    last.close = priorClose * (direction === 'BUY' ? 1.01 : 0.99);
    last.high = Math.max(last.open, last.close) * 1.002;
    last.low = Math.min(last.open, last.close) * 0.998;
    return out;
  }, [pair, tf, direction, seedPrice, candleCount]);

  const { min, max } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const c of candles) {
      if (c.low < mn) mn = c.low;
      if (c.high > mx) mx = c.high;
    }
    const pad = (mx - mn) * 0.05 || 1;
    return { min: mn - pad, max: mx + pad };
  }, [candles]);

  const viewW = candleCount * 10;
  const scaleY = (v: number) => ((max - v) / (max - min)) * height;
  const patternIdx = candles.length - 1;

  return (
    <div
      className={`rounded-xl border dark:border-white/10 light:border-slate-200 dark:bg-black/30 light:bg-white/90 overflow-hidden ${className}`}
      aria-label={`${pair} ${tf} chart, ${direction.toLowerCase()} bias`}
    >
      <svg
        viewBox={`0 0 ${viewW} ${height}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
      >
        {candles.map((c, i) => {
          const x = i * 10 + 5;
          const isPattern = i === patternIdx;
          const bullish = c.close >= c.open;
          const bodyTop = scaleY(Math.max(c.open, c.close));
          const bodyBottom = scaleY(Math.min(c.open, c.close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const color = isPattern
            ? direction === 'BUY'
              ? '#13ec37'
              : '#ff4444'
            : bullish
              ? 'rgba(19,236,55,0.55)'
              : 'rgba(255,68,68,0.55)';
          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={scaleY(c.high)}
                y2={scaleY(c.low)}
                stroke={color}
                strokeWidth={isPattern ? 1.5 : 1}
              />
              <rect
                x={x - 3}
                y={bodyTop}
                width={6}
                height={bodyHeight}
                fill={color}
                stroke={isPattern ? color : 'none'}
                strokeWidth={isPattern ? 1 : 0}
              />
              {isPattern && (
                <rect
                  x={x - 5}
                  y={bodyTop - 2}
                  width={10}
                  height={bodyHeight + 4}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="2,2"
                  opacity={0.8}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
