import React, { useMemo } from 'react';
import type { Direction, TF, TFLifeState } from '../../core-layer/types';

interface MockCandle {
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
  /** Roughly how many candles to draw. Defaults to 7 (new pair-detail spec). */
  candleCount?: number;
  /** Chart body height in pixels. Arrow strip adds ~28px below. */
  height?: number;
  /**
   * Life state of the TF this chart represents. Drives the color of the
   * "signal candle" arrow rendered below the body. `fresh` → primary green,
   * `breathing` → amber, `steady` → muted gray. Defaults to `steady`.
   */
  lifeState?: TFLifeState;
  className?: string;
}

/** Color of the arrow below the chart per life state (spec: static, no motion). */
const ARROW_COLOR: Record<TFLifeState, string> = {
  fresh: '#13ec37',
  breathing: '#f59e0b',
  steady: '#9ca3af',
};

/**
 * Small SVG candlestick chart used on the pair-detail grid (one per TF in the
 * chain). Renders 7 candles by default with the last candle as the "signal
 * candle" — thick body + thicker stroke — plus a solid arrow below the chart
 * pointing up at the signal candle. Arrow color derives from `lifeState`.
 *
 * No entry / SL / TP overlays per ADR D6: Core-Layer is not a trade signal.
 * Candles are generated deterministically from `seedPrice` so the same pair+TF
 * always renders the same chart in mock mode.
 */
export const CoreLayerChart: React.FC<CoreLayerChartProps> = ({
  pair,
  tf,
  direction,
  seedPrice,
  candleCount = 7,
  height = 140,
  lifeState = 'steady',
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
      const drift = (rand() - 0.5) * seedPrice * 0.015;
      const open = price;
      const close = price + drift;
      const high = Math.max(open, close) + rand() * seedPrice * 0.008;
      const low = Math.min(open, close) - rand() * seedPrice * 0.008;
      out.push({ open, high, low, close });
      price = close;
    }
    // Signal candle — force a pronounced directional body on the last candle.
    const last = out[out.length - 1];
    const priorClose = out[out.length - 2]?.close ?? last.open;
    last.open = priorClose * (direction === 'BUY' ? 0.994 : 1.006);
    last.close = priorClose * (direction === 'BUY' ? 1.014 : 0.986);
    last.high = Math.max(last.open, last.close) * 1.003;
    last.low = Math.min(last.open, last.close) * 0.997;
    return out;
  }, [pair, tf, direction, seedPrice, candleCount]);

  const { min, max } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const c of candles) {
      if (c.low < mn) mn = c.low;
      if (c.high > mx) mx = c.high;
    }
    const pad = (mx - mn) * 0.1 || 1;
    return { min: mn - pad, max: mx + pad };
  }, [candles]);

  const candleSlot = 30;
  const viewW = candleCount * candleSlot;
  const arrowAreaH = 28;
  const chartH = height;
  const totalH = chartH + arrowAreaH;
  const scaleY = (v: number) => ((max - v) / (max - min)) * chartH;
  const signalIdx = candles.length - 1;
  const signalX = signalIdx * candleSlot + candleSlot / 2;
  const arrowColor = ARROW_COLOR[lifeState];

  return (
    <div
      className={`rounded-lg dark:bg-black/20 light:bg-white/80 overflow-hidden ${className}`}
      aria-label={`${pair} ${tf} chart, ${direction.toLowerCase()} bias, ${lifeState}`}
    >
      <svg
        viewBox={`0 0 ${viewW} ${totalH}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height: totalH }}
      >
        {candles.map((c, i) => {
          const x = i * candleSlot + candleSlot / 2;
          const isSignal = i === signalIdx;
          const bullish = c.close >= c.open;
          const bodyTop = scaleY(Math.max(c.open, c.close));
          const bodyBottom = scaleY(Math.min(c.open, c.close));
          const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
          const color = isSignal
            ? direction === 'BUY'
              ? '#13ec37'
              : '#ff4444'
            : bullish
              ? 'rgba(19,236,55,0.55)'
              : 'rgba(255,68,68,0.55)';
          const strokeW = isSignal ? 2.5 : 1;
          const bodyW = isSignal ? 14 : 10;
          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={scaleY(c.high)}
                y2={scaleY(c.low)}
                stroke={color}
                strokeWidth={strokeW}
              />
              <rect
                x={x - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyHeight}
                fill={color}
                stroke={isSignal ? color : 'none'}
                strokeWidth={strokeW}
                strokeLinejoin="round"
              />
            </g>
          );
        })}
        {/* Arrow strip — dashed guide line + triangle pointing UP at signal candle. */}
        <g>
          <line
            x1={signalX}
            x2={signalX}
            y1={chartH + 2}
            y2={chartH + 8}
            stroke={arrowColor}
            strokeWidth={1.5}
            strokeDasharray="2,2"
            opacity={0.7}
          />
          <polygon
            points={`${signalX},${chartH + 8} ${signalX - 8},${chartH + 22} ${signalX + 8},${chartH + 22}`}
            fill={arrowColor}
            stroke={arrowColor}
            strokeLinejoin="round"
            strokeWidth={1}
          />
        </g>
      </svg>
    </div>
  );
};
