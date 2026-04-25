import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
import { useTheme } from '../contexts/ThemeContext';
import { TradingViewWidget } from './TradingViewWidget';
import {
  drawCisdOverlays,
  isCisdFamilySignal,
} from '../utils/drawCisdOverlays';
import { makeKlineCisdAdapter } from '../utils/klineCisdAdapter';
import { registerExtensions } from '../core-layer/kline-extensions';
import { isRsiDivergenceSignalId } from '../utils/rsiStrategy';
import { calculateRSI, detectLastDivergence } from '../utils/rsiDivergence';
// Local Candle / Signal types match the LOOSE shapes declared inline in
// InteractiveLiveChart.tsx (lines 182, 209). Mirroring them locally lets
// `InteractiveLiveChartGate` pass props through without coercion — the
// canonical types in `types/index.ts` are stricter (e.g. openTime: string
// only, price: number only) and would reject perfectly valid LW props.
interface Candle {
  id?: string;
  symbol: string;
  timeframe: string;
  openTime: Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number | null;
}

interface Signal {
  id: string;
  symbol: string;
  timeframe: string;
  signalType: 'BUY' | 'SELL';
  detectedAt: Date | string;
  price: number | string;
  metadata?: Record<string, unknown>;
  current_sl_price?: number;
  sl_price?: number;
  se_current_sl?: number;
  se_sl?: number;
  tp1_price?: number;
  se_tp1?: number;
  tp2_price?: number;
  se_tp2?: number;
  tp3_price?: number;
  tp1_hit?: boolean;
  tp2_hit?: boolean;
  tp3_hit?: boolean;
  [key: string]: unknown;
}

/* ────────────── color tokens ────────────── */

const UP_COLOR = '#089981';
const DOWN_COLOR = '#F23645';
const SIGNAL_BUY_COLOR = '#089981';
const SIGNAL_SELL_COLOR = '#F23645';
const SE_SL_COLOR = '#F23645';
const SE_TP1_COLOR = '#f59e0b';
const SE_TP2_COLOR = '#22d3ee';
const SE_TP3_COLOR = '#089981';

const MAX_CANDLES = 300;

/* ────────────── chart-wide styles (theme-aware) ────────────── */

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
      // Tooltip suppressed — the LW chart shows TV-style hover legends via
      // crosshair labels instead. klinecharts' default candle tooltip is
      // a different visual idiom that would feel out of place beside the
      // existing UI.
      tooltip: { showRule: TooltipShowRule.None },
      priceMark: {
        last: { show: true },
        high: { show: false },
        low: { show: false },
      },
    },
    grid: {
      horizontal: {
        color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        style: LineType.Dashed,
        dashedValue: [2, 2],
      },
      vertical: {
        color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        style: LineType.Dashed,
        dashedValue: [2, 2],
      },
    },
    xAxis: {
      axisLine: { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)', size: 1 },
      tickLine: { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)', size: 1 },
      // Bumped from 11 → 12 and light-mode color from #475569 → #4b5563
      // for readability parity with the LW baseline. `family: inherit`
      // picks up the app's system font instead of klinecharts' default
      // sans-serif (which renders thinner on macOS).
      tickText: {
        color: isDark ? '#9ca3af' : '#4b5563',
        size: 12,
        family: 'inherit',
      },
    },
    yAxis: {
      axisLine: { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)', size: 1 },
      tickLine: { color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)', size: 1 },
      tickText: {
        color: isDark ? '#9ca3af' : '#4b5563',
        size: 12,
        family: 'inherit',
      },
    },
    crosshair: {
      horizontal: {
        line: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' },
        text: { backgroundColor: '#13ec37' },
      },
      vertical: {
        line: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' },
        text: { backgroundColor: '#13ec37' },
      },
    },
    separator: { color: 'transparent' },
  };
}

/* ────────────── helpers ────────────── */

function getTradingViewTimeframe(tf: string): string {
  switch (tf) {
    case '1w':
      return 'W';
    case '1d':
    case 'D':
      return 'D';
    case '4h':
      return '240';
    case '1h':
      return '60';
    case '15m':
      return '15';
    case '5m':
      return '5';
    default:
      return tf;
  }
}

/** Closest-bar lookup. */
function findSignalCandleIndex(
  candles: Candle[],
  detectedAtMs: number,
): number {
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(
      new Date(candles[i].openTime).getTime() - detectedAtMs,
    );
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

interface SeLines {
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
}

function readSeLines(signal: Signal | undefined): SeLines | null {
  if (!signal?.id?.startsWith('SUPER_ENGULFING')) return null;
  const meta = (signal.metadata ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const sl =
    num((signal as any).current_sl_price) ??
    num((signal as any).sl_price) ??
    num((signal as any).se_current_sl) ??
    num((signal as any).se_sl) ??
    num(meta.se_sl);
  const tp1 = num((signal as any).tp1_price) ?? num((signal as any).se_tp1) ?? num(meta.se_tp1);
  const tp2 = num((signal as any).tp2_price) ?? num((signal as any).se_tp2) ?? num(meta.se_tp2);
  const tp3 = num((signal as any).tp3_price) ?? num(meta.tp3_price);
  if (sl == null && tp1 == null && tp2 == null && tp3 == null) return null;
  return { sl, tp1, tp2, tp3 };
}

/* ────────────── component ────────────── */

interface KlineInteractiveLiveChartProps {
  candles: Candle[];
  signal?: Signal;
  /** Same-symbol same-tf CISD rows (for grouped MSS overlays). */
  relatedSignals?: Signal[];
  symbol: string;
  timeframe: string;
  height?: number;
  isFullscreen?: boolean;
  isFloating?: boolean;
  onPriceUpdate?: (price: number, change: number) => void;
  onCandleUpdate?: (candle: Candle) => void;
}

/**
 * klinecharts implementation of InteractiveLiveChart. Mounted via
 * InteractiveLiveChartGate when the URL carries `?engine=kline` AND the
 * signal is NOT RSI-divergence (RSI signals fall back to the LW engine
 * for now — RSI sub-pane is Chunk #5, separate PR).
 *
 * Feature-parity scope (PR #18 / Chunk #4):
 *   - Candle rendering with theme-aware colors
 *   - 300-bar lookback
 *   - Signal arrow at the signal candle (cl-signal overlay)
 *   - SE SL/TP1/TP2/TP3 horizontal segments via klinecharts `segment` overlay
 *   - CISD MSS / FVG / RC / retest band via drawCisdOverlays + the
 *     CisdLwChartApi shim (utils/klineCisdAdapter)
 *   - TradingView iframe toggle (same UX as LW chart)
 *   - Theme switch via setStyles in place
 *   - Resize via ResizeObserver
 *   - onPriceUpdate / onCandleUpdate notifications
 *
 * Out of scope (deferred to later chunks):
 *   - RSI sub-pane (Chunk #5)
 *   - Replay / scrub
 *   - Direction-warning UI (CISD has its own MSS labels)
 */
export function KlineInteractiveLiveChart({
  candles,
  signal,
  relatedSignals,
  symbol,
  timeframe,
  height = 600,
  isFullscreen = false,
  isFloating = false,
  onCandleUpdate,
  onPriceUpdate,
}: KlineInteractiveLiveChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const overlayIdsRef = useRef<string[]>([]);
  const cisdCleanupRef = useRef<(() => void) | null>(null);
  const lastPriceRef = useRef<number | null>(null);
  // Refs that drive the applyNewData-vs-updateData decision in the data
  // effect below. Tracked outside React state because writing them must
  // not retrigger renders — they're memoization keys for the chart engine
  // call, not UI state.
  const dataContextRef = useRef<string>('');
  const lastBarTsRef = useRef<number>(0);
  const lastBarCountRef = useRef<number>(0);
  // RSI sub-pane id, populated by createIndicator when isRsi is true and
  // cleared by removeIndicator when it flips to false (e.g. user nav from
  // an RSI signal to a CISD signal without remounting the chart).
  const rsiPaneIdRef = useRef<string | null>(null);
  const [showTradingView, setShowTradingView] = useState(false);

  const isRsi = isRsiDivergenceSignalId(signal?.id);

  // Slice once per render — never push more than MAX_CANDLES into the
  // engine. Memoize the KLineData shape too so applyNewData isn't called
  // with a fresh array reference on every theme/state change.
  const klineData: KLineData[] = useMemo(() => {
    const slice = candles.length > MAX_CANDLES
      ? candles.slice(-MAX_CANDLES)
      : candles;
    return slice.map((c) => ({
      timestamp: new Date(c.openTime).getTime(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: typeof c.volume === 'number' ? c.volume : 0,
    }));
  }, [candles]);

  const slicedCandles = useMemo<Candle[]>(
    () =>
      candles.length > MAX_CANDLES
        ? candles.slice(-MAX_CANDLES)
        : candles,
    [candles],
  );

  // One-time chart construction. Theme reskin happens via setStyles below.
  useEffect(() => {
    if (showTradingView) return;
    registerExtensions();
    const container = containerRef.current;
    if (!container) return;

    // Reset the data-tracking fingerprint refs before every fresh init().
    // Without this, toggling to the TradingView iframe and back disposes
    // the old chart but leaves dataContextRef set to the prior
    // `${symbol}|${tf}` — the data effect then takes its "continuation"
    // branch and calls updateData(lastBar) on the empty new chart instead
    // of applyNewData(full dataset). Visible symptoms: chart shows 1 bar,
    // RSI is NaN (needs 14+ bars), divergence overlays anchor to indices
    // off-screen, entry-price line draws into a 1-bar pane. Same failure
    // would hit non-RSI signals (CISD, SE) — the fingerprint doesn't
    // branch on signal type. overlayIdsRef + cisdCleanupRef are already
    // cleared by the cleanup below; we don't double-reset them here.
    dataContextRef.current = '';
    lastBarTsRef.current = 0;
    lastBarCountRef.current = 0;

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
      // Always run any pending CISD cleanup before disposing the chart —
      // same lesson as the InteractiveLiveChart fix in PR #9.
      try {
        cisdCleanupRef.current?.();
      } catch {
        /* ignore */
      }
      cisdCleanupRef.current = null;
      try {
        dispose(container);
      } catch {
        /* ignore */
      }
      chartRef.current = null;
      overlayIdsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTradingView]);

  // Theme switch — recolor in place without recreating the chart.
  useEffect(() => {
    chartRef.current?.setStyles(buildStyles(isDark));
  }, [isDark]);

  // RSI pane lifecycle. Adds the WILDER_RSI indicator in its own pane
  // when the active signal is RSI-divergence-based; removes it when the
  // signal changes to something else. Pane id is captured so the data
  // effect can anchor divergence overlays to it.
  //
  // Why a separate effect: the data effect re-runs on every candle tick;
  // we DON'T want to add/remove the indicator on every tick. This effect
  // depends only on `isRsi` and the chart instance — it fires once when
  // the user lands on an RSI signal and never again until they navigate
  // away.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || showTradingView) return;
    if (!isRsi) {
      if (rsiPaneIdRef.current) {
        try {
          chart.removeIndicator(rsiPaneIdRef.current, 'WILDER_RSI');
        } catch {
          /* ignore */
        }
        rsiPaneIdRef.current = null;
      }
      return;
    }
    if (rsiPaneIdRef.current) return; // already mounted
    const paneId = chart.createIndicator(
      'WILDER_RSI',
      false, // false = create a new pane below; do NOT stack on candle pane
      { height: isFullscreen ? 200 : 180 },
    );
    rsiPaneIdRef.current = typeof paneId === 'string' ? paneId : null;
    return () => {
      if (rsiPaneIdRef.current && chartRef.current) {
        try {
          chartRef.current.removeIndicator(rsiPaneIdRef.current, 'WILDER_RSI');
        } catch {
          /* ignore */
        }
      }
      rsiPaneIdRef.current = null;
    };
  }, [isRsi, isFullscreen, showTradingView]);

  // Data + overlays update.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || showTradingView) return;
    if (klineData.length === 0) {
      try {
        chart.applyNewData([]);
      } catch {
        /* ignore */
      }
      dataContextRef.current = '';
      lastBarTsRef.current = 0;
      lastBarCountRef.current = 0;
      return;
    }

    // Tear down previous overlays before drawing the new set. CISD has
    // its own cleanup contract (see PR #7); the cl-signal / cl-segment
    // overlays we manage directly.
    try {
      cisdCleanupRef.current?.();
    } catch {
      /* ignore */
    }
    cisdCleanupRef.current = null;
    for (const id of overlayIdsRef.current) {
      try {
        chart.removeOverlay(id);
      } catch {
        /* ignore */
      }
    }
    overlayIdsRef.current = [];

    // Pan/scroll preservation: klinecharts' applyNewData snaps the visible
    // range back to the latest bar. Calling it on every live tick (every
    // few seconds) makes pan/scroll unusable — the chart fights the user.
    //
    //   - First mount or symbol/timeframe change → applyNewData (snap is
    //     expected; the user just navigated to this signal)
    //   - One new bar appended → updateData(lastBar) — preserves view
    //   - Last bar OHLC mutated (live tick) → updateData(lastBar)
    //   - Anything else (count drop, multi-bar resync) → applyNewData,
    //     accept the snap. Rare in practice.
    //
    // Reference: feasibility report Step 2 noted klinecharts' OnVisibleRange
    // event but didn't flag the applyNewData snap-back behavior because
    // the Core-Layer mini tile doesn't pan. The full chart does.
    const newContext = `${symbol}|${timeframe}`;
    const lastBarTs = klineData[klineData.length - 1].timestamp;
    const isInitial = dataContextRef.current === '';
    const isContextChange = dataContextRef.current !== newContext;
    const isSingleBarAppend =
      !isContextChange &&
      !isInitial &&
      klineData.length === lastBarCountRef.current + 1;
    const isLastBarMutation =
      !isContextChange &&
      !isInitial &&
      klineData.length === lastBarCountRef.current &&
      lastBarTs === lastBarTsRef.current;

    try {
      if (isInitial || isContextChange) {
        chart.applyNewData(klineData);
      } else if (isSingleBarAppend || isLastBarMutation) {
        chart.updateData(klineData[klineData.length - 1]);
      } else {
        // Count changed by more than 1, or last bar timestamp went
        // backwards — full resync is the only safe path. Snap is
        // acceptable because this branch indicates the upstream candle
        // source was substantially refreshed (e.g. tab refocus after
        // long sleep, websocket reconnect with backfill).
        chart.applyNewData(klineData);
      }
    } catch {
      /* ignore */
    }
    dataContextRef.current = newContext;
    lastBarTsRef.current = lastBarTs;
    lastBarCountRef.current = klineData.length;

    // Notify parent of the latest price so the SignalDetails header price
    // pill stays in sync — same callback shape as InteractiveLiveChart.
    if (slicedCandles.length > 0) {
      const last = slicedCandles[slicedCandles.length - 1];
      const prev =
        slicedCandles.length > 1
          ? slicedCandles[slicedCandles.length - 2]
          : null;
      if (lastPriceRef.current !== last.close) {
        const change = prev
          ? ((last.close - prev.close) / prev.close) * 100
          : 0;
        onPriceUpdate?.(last.close, change);
        lastPriceRef.current = last.close;
      }
      onCandleUpdate?.(last);
    }

    if (!signal) return;

    const signalCandleIndex = findSignalCandleIndex(
      slicedCandles,
      new Date(signal.detectedAt).getTime(),
    );

    // CISD path: delegate the entire overlay layer to drawCisdOverlays via
    // the kline shim. drawCisdOverlays handles MSS/FVG/RC/retest band
    // line drawing AND the HTML labels — single integration point.
    if (isCisdFamilySignal(signal)) {
      const siblings = (relatedSignals ?? []).filter(
        (r) => r.symbol === symbol && r.timeframe === timeframe,
      );
      const alreadyIncluded = siblings.some((r) => r.id === signal.id);
      const overlaySignals = (alreadyIncluded ? siblings : [signal, ...siblings]).map(
        (s) => ({
          detectedAt: s.detectedAt,
          signalType: s.signalType,
          price: typeof s.price === 'number' ? s.price : Number(s.price ?? 0),
          metadata: (s.metadata ?? {}) as Record<string, unknown>,
        }),
      );
      const candleBars = slicedCandles.map((c) => ({
        time: Math.floor(new Date(c.openTime).getTime() / 1000) as unknown as import('lightweight-charts').Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const { chartApi, seriesApi } = makeKlineCisdAdapter(chart);
      cisdCleanupRef.current = drawCisdOverlays(
        chartApi,
        seriesApi,
        candleBars,
        overlaySignals,
        { overlayHost: containerRef.current },
      );
      return;
    }

    // Non-CISD: signal arrow at the signal candle + (for SE) SL/TP segments.
    if (signalCandleIndex < 0) return;

    const sigCandle = slicedCandles[signalCandleIndex];
    const sigTimestamp = new Date(sigCandle.openTime).getTime();
    const isBuy = signal.signalType === 'BUY';
    const arrowDir: 'up' | 'down' = isBuy ? 'up' : 'down';
    const arrowColor = isBuy ? SIGNAL_BUY_COLOR : SIGNAL_SELL_COLOR;
    // Anchor below the bar for BUY (arrow points up at the low), above for
    // SELL — matches LW belowBar/aboveBar positioning.
    const anchorPrice = isBuy ? sigCandle.low : sigCandle.high;
    // Pattern-aware label (mirrors the LW chart's patternLabel logic).
    const meta = (signal.metadata ?? {}) as Record<string, unknown>;
    const patternType =
      typeof meta.type === 'string'
        ? (meta.type as string)
        : typeof meta.pattern === 'string'
          ? (meta.pattern as string)
          : '';
    const patternLabel = patternType
      ? patternType
          .replace('_PLUS', '+')
          .replace('_XL', '')
          .replace('_2X', '')
          .replace('_', ' ')
      : isBuy
        ? 'LONG'
        : 'SHORT';

    const arrowId = chart.createOverlay({
      name: 'cl-signal',
      points: [{ timestamp: sigTimestamp, value: anchorPrice }],
      extendData: {
        dir: arrowDir,
        color: arrowColor,
        text: patternLabel,
        size: 'md',
      },
    });
    if (typeof arrowId === 'string' && arrowId) {
      overlayIdsRef.current.push(arrowId);
    }

    // SE SL/TP1/TP2/TP3 horizontal segments. Match the LW chart's
    // styling (red dashed SL, amber dotted TP1, cyan dotted TP2, green
    // solid TP3) and bound the segments from a few bars before the
    // signal to the right edge of the visible data.
    const seLines = readSeLines(signal);
    if (seLines) {
      const lineStartIdx = Math.max(0, signalCandleIndex - 5);
      const startTs = new Date(slicedCandles[lineStartIdx].openTime).getTime();
      const endTs = new Date(
        slicedCandles[slicedCandles.length - 1].openTime,
      ).getTime();
      const seg = (
        price: number,
        color: string,
        styleSpec: { style: LineType; dashedValue?: number[] },
        size = 1,
      ): void => {
        const id = chart.createOverlay({
          name: 'segment',
          points: [
            { timestamp: startTs, value: price },
            { timestamp: endTs, value: price },
          ],
          styles: {
            line: {
              color,
              size,
              style: styleSpec.style,
              ...(styleSpec.dashedValue
                ? { dashedValue: styleSpec.dashedValue }
                : {}),
            },
          },
          lock: true,
        });
        if (typeof id === 'string' && id) overlayIdsRef.current.push(id);
      };
      if (seLines.sl != null) {
        seg(seLines.sl, SE_SL_COLOR, { style: LineType.Dashed, dashedValue: [4, 4] }, 2);
      }
      if (seLines.tp1 != null) {
        seg(seLines.tp1, SE_TP1_COLOR, { style: LineType.Dashed, dashedValue: [2, 4] }, 1);
      }
      if (seLines.tp2 != null) {
        seg(seLines.tp2, SE_TP2_COLOR, { style: LineType.Dashed, dashedValue: [2, 4] }, 1);
      }
      if (seLines.tp3 != null) {
        seg(seLines.tp3, SE_TP3_COLOR, { style: LineType.Solid }, 2);
      }
    }

    // RSI divergence trend lines. Mirrors the LW chart's behavior: when
    // the active signal is RSI-divergence-based AND we have enough data,
    // detect the LAST regular divergence and draw two parallel lines —
    // one across the RSI pane (between RSI-value pivots), one across the
    // candle pane (between price pivots). Identical color, identical
    // overlay shape (line + 2 endpoint circles).
    if (isRsi && slicedCandles.length > 30) {
      const closes = slicedCandles.map((c) => c.close);
      const rsiVals = calculateRSI(closes, 14);
      const divResult = detectLastDivergence(
        slicedCandles.map((c) => ({
          high: c.high,
          low: c.low,
          close: c.close,
          openTime:
            c.openTime instanceof Date ? c.openTime.toISOString() : c.openTime,
        })),
        rsiVals,
        signal.signalType,
        typeof (signal.metadata as Record<string, unknown> | undefined)
          ?.divergenceType === 'string'
          ? ((signal.metadata as Record<string, unknown>)
              .divergenceType as string)
          : '',
      );
      if (divResult) {
        const isBullish = divResult.type === 'bullish';
        const color = isBullish ? '#089981' : '#F23645';
        const pointer: 'up' | 'down' = isBullish ? 'up' : 'down';
        const prevTs = new Date(
          slicedCandles[divResult.prevPivotIdx].openTime,
        ).getTime();
        const currTs = new Date(
          slicedCandles[divResult.currPivotIdx].openTime,
        ).getTime();

        // (a) Price-pane divergence line — anchored to candle_pane,
        // connecting the two PRICE pivots. paneId passed explicitly:
        // klinecharts' default-pane behavior with multi-pane charts can
        // be unpredictable (sometimes the most recently created pane
        // wins). Explicit 'candle_pane' is the safe path.
        const priceLineIdRaw = chart.createOverlay(
          {
            name: 'cl-rsi-divergence',
            points: [
              { timestamp: prevTs, value: divResult.prevPivotPrice },
              { timestamp: currTs, value: divResult.currPivotPrice },
            ],
            extendData: { color, labelA: 'Pivot 1', labelB: 'Pivot 2', pointer },
          },
          'candle_pane',
        );
        const priceLineId =
          typeof priceLineIdRaw === 'string' && priceLineIdRaw
            ? priceLineIdRaw
            : null;
        if (priceLineId) {
          overlayIdsRef.current.push(priceLineId);
        } else if (typeof console !== 'undefined') {
          console.warn(
            '[KlineInteractiveLiveChart] price-pane divergence overlay creation returned null',
          );
        }

        // (b) RSI-pane divergence line — same overlay shape, anchored to
        // the RSI pane via paneId, connecting the two RSI VALUE pivots.
        let rsiLineId: string | null = null;
        if (rsiPaneIdRef.current) {
          const rsiLineIdRaw = chart.createOverlay(
            {
              name: 'cl-rsi-divergence',
              points: [
                { timestamp: prevTs, value: divResult.prevPivotRsi },
                { timestamp: currTs, value: divResult.currPivotRsi },
              ],
              extendData: { color, labelA: 'Pivot 1', labelB: 'Pivot 2', pointer },
            },
            rsiPaneIdRef.current,
          );
          rsiLineId =
            typeof rsiLineIdRaw === 'string' && rsiLineIdRaw
              ? rsiLineIdRaw
              : null;
          if (rsiLineId) {
            overlayIdsRef.current.push(rsiLineId);
          } else if (typeof console !== 'undefined') {
            console.warn(
              '[KlineInteractiveLiveChart] RSI-pane divergence overlay creation returned null',
              { rsiPaneId: rsiPaneIdRef.current },
            );
          }
        } else if (typeof console !== 'undefined') {
          console.warn(
            '[KlineInteractiveLiveChart] RSI pane id not yet captured — divergence on RSI pane skipped',
          );
        }

      } else if (typeof console !== 'undefined') {
        console.warn(
          '[KlineInteractiveLiveChart] detectLastDivergence returned null',
          { signalId: signal.id, candleCount: slicedCandles.length },
        );
      }
    }

    // Entry-price horizontal line — drawn for EVERY signal where we
    // have a signal candle index, mirrors LW's "displacement line"
    // (InteractiveLiveChart.tsx line 945). LW uses addLineSeries with
    // priceLineVisible:true to auto-show the value label on the right
    // axis. klinecharts' built-in `priceLine` overlay is the
    // equivalent primitive — full-width horizontal line at the price
    // level, value label on the price axis automatically.
    if (signalCandleIndex >= 0) {
      const sigCandle = slicedCandles[signalCandleIndex];
      const entryPrice =
        typeof signal.price === 'number'
          ? signal.price
          : Number(signal.price ?? sigCandle.close);
      if (Number.isFinite(entryPrice)) {
        const entryColor =
          signal.signalType === 'BUY' ? '#089981' : '#F23645';
        const entryLineId = chart.createOverlay(
          {
            name: 'priceLine',
            points: [{ value: entryPrice }],
            styles: {
              line: {
                color: entryColor,
                size: 2,
                style: LineType.Solid,
              },
            },
            lock: true,
          },
          'candle_pane',
        );
        if (typeof entryLineId === 'string' && entryLineId) {
          overlayIdsRef.current.push(entryLineId);
        }
      }
    }
  }, [
    klineData,
    slicedCandles,
    signal,
    relatedSignals,
    symbol,
    isRsi,
    timeframe,
    showTradingView,
    onPriceUpdate,
    onCandleUpdate,
  ]);

  return (
    <div
      className="relative w-full h-full"
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {/* Top-right toolbar: TradingView toggle. The fullscreen toggle is
          owned by SignalDetails (it controls layout outside this chart). */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowTradingView((s) => !s)}
          aria-pressed={showTradingView}
          title={
            showTradingView ? 'Switch to native chart' : 'Switch to TradingView'
          }
          className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[11px] font-bold border backdrop-blur-md transition-all ${
            showTradingView
              ? 'bg-primary/15 text-primary border-primary/40'
              : 'dark:bg-black/40 light:bg-white/70 dark:border-white/10 light:border-green-200/60 dark:text-gray-300 light:text-slate-700 hover:text-primary hover:border-primary/30'
          }`}
        >
          <span className="material-symbols-outlined text-[14px] mr-1">
            {showTradingView ? 'candlestick_chart' : 'public'}
          </span>
          {showTradingView ? 'Native' : 'TradingView'}
        </motion.button>
        <span
          className="px-2 py-0.5 text-[10px] font-mono font-black uppercase tracking-wider rounded-md border backdrop-blur-md dark:bg-amber-500/10 light:bg-amber-100 dark:text-amber-400 light:text-amber-700 dark:border-amber-500/30 light:border-amber-300"
          title="klinecharts proof-of-concept (?engine=kline). Falls back to lightweight-charts when flag is absent."
        >
          KLINE PoC
        </span>
      </div>

      {showTradingView ? (
        <div
          className="absolute inset-0 z-10 dark:bg-background-dark/95 light:bg-white/95 backdrop-blur-sm"
          style={{ borderRadius: isFloating ? '1rem' : '0 0 1rem 1rem' }}
        >
          <TradingViewWidget
            symbol={symbol}
            interval={getTradingViewTimeframe(timeframe)}
            theme={isDark ? 'dark' : 'light'}
            height="100%"
          />
        </div>
      ) : (
        <div
          ref={containerRef}
          className="w-full h-full relative overflow-hidden border dark:border-white/5 light:border-green-200 shadow-2xl"
          style={{
            borderRadius: isFloating ? '1rem' : '0 0 1rem 1rem',
            // isFullscreen is honored by the parent's height prop already;
            // kept in deps so re-renders propagate (no special handling
            // needed beyond ResizeObserver's reaction).
            minHeight: isFullscreen ? `${Math.max(320, height - 80)}px` : '320px',
          }}
        />
      )}
    </div>
  );
}
