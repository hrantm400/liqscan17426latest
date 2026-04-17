import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { createChart, ColorType, Time, TickMarkType } from 'lightweight-charts';
import { wsService } from '../services/websocket';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { formatChartTimeForUser } from '../utils/userTimeFormat';
import { TradingViewWidget } from './TradingViewWidget';
import { detectICTBias } from '../services/signalsApi';
import { drawCisdOverlays, isCisdFamilySignal } from '../utils/drawCisdOverlays';
import { mountTvChartLabels, type TvLabelItem } from '../utils/lwChartTvLabels';
import { isRsiDivergenceSignalId } from '../utils/rsiStrategy';
// import { api } from '../services/api'; // TODO: Re-enable when API service is recreated

// Type definitions for lightweight-charts
type IChartApi = ReturnType<typeof createChart>;
type ISeriesApi<T = any> = { __brand?: T; [key: string]: any }; // Simplified type for series

// ============================================================
// RSI CALCULATION (Wilder's smoothing — matches TradingView)
// ============================================================
function calculateRSI(closes: number[], length = 14): number[] {
  const rsi = new Array(closes.length).fill(NaN);
  if (closes.length < length + 1) return rsi;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < length; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= length;
  avgLoss /= length;

  if (avgLoss === 0) rsi[length] = 100;
  else {
    const rs = avgGain / avgLoss;
    rsi[length] = 100 - 100 / (1 + rs);
  }

  for (let i = length; i < gains.length; i++) {
    avgGain = (avgGain * (length - 1) + gains[i]) / length;
    avgLoss = (avgLoss * (length - 1) + losses[i]) / length;
    if (avgLoss === 0) rsi[i + 1] = 100;
    else {
      const rs = avgGain / avgLoss;
      rsi[i + 1] = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

// ============================================================
// PIVOT DETECTION — ported from indicators.js
// ============================================================
function findPivotLows(data: number[], lbL = 5, lbR = 5): boolean[] {
  const pivots = new Array(data.length).fill(false);
  for (let i = lbL; i < data.length - lbR; i++) {
    if (isNaN(data[i])) continue;
    let isPivot = true;
    for (let j = 1; j <= lbL; j++) {
      if (isNaN(data[i - j]) || data[i - j] <= data[i]) { isPivot = false; break; }
    }
    if (!isPivot) continue;
    for (let j = 1; j <= lbR; j++) {
      if (isNaN(data[i + j]) || data[i + j] <= data[i]) { isPivot = false; break; }
    }
    if (isPivot) pivots[i] = true;
  }
  return pivots;
}

function findPivotHighs(data: number[], lbL = 5, lbR = 5): boolean[] {
  const pivots = new Array(data.length).fill(false);
  for (let i = lbL; i < data.length - lbR; i++) {
    if (isNaN(data[i])) continue;
    let isPivot = true;
    for (let j = 1; j <= lbL; j++) {
      if (isNaN(data[i - j]) || data[i - j] >= data[i]) { isPivot = false; break; }
    }
    if (!isPivot) continue;
    for (let j = 1; j <= lbR; j++) {
      if (isNaN(data[i + j]) || data[i + j] >= data[i]) { isPivot = false; break; }
    }
    if (isPivot) pivots[i] = true;
  }
  return pivots;
}

// Detect the LAST divergence from candle data (matching the signal)
interface DivergenceResult {
  prevPivotIdx: number;
  currPivotIdx: number;
  prevPivotPrice: number;
  currPivotPrice: number;
  prevPivotRsi: number;
  currPivotRsi: number;
  type: 'bullish' | 'bearish';
}

function detectLastDivergence(
  candles: { high: number; low: number; close: number; openTime: string | number }[],
  rsiValues: number[],
  signalType: 'BUY' | 'SELL',
  divergenceType: string
): DivergenceResult | null {
  const lbL = 5, lbR = 5;
  const rangeLower = 5, rangeUpper = 60;
  const limitUpper = 70, limitLower = 30;

  const isBullish = signalType === 'BUY' || divergenceType?.includes('bullish');

  if (isBullish) {
    // Bullish: look for pivot lows on RSI
    const pivotLows = findPivotLows(rsiValues, lbL, lbR);
    const positions: number[] = [];
    for (let i = 0; i < pivotLows.length; i++) {
      if (pivotLows[i]) positions.push(i);
    }
    // Search from the end to find the LAST matching divergence
    for (let k = positions.length - 1; k >= 1; k--) {
      const curr = positions[k];
      const prev = positions[k - 1];
      const barsBetween = curr - prev;
      if (barsBetween < rangeLower || barsBetween > rangeUpper) continue;

      const oscCurr = rsiValues[curr];
      const oscPrev = rsiValues[prev];
      const priceCurr = candles[curr].low;
      const pricePrev = candles[prev].low;

      // Regular bullish: price lower low, RSI higher low, prev RSI in oversold zone
      if (priceCurr < pricePrev && oscCurr > oscPrev && oscPrev < limitLower) {
        return {
          prevPivotIdx: prev, currPivotIdx: curr,
          prevPivotPrice: pricePrev, currPivotPrice: priceCurr,
          prevPivotRsi: oscPrev, currPivotRsi: oscCurr,
          type: 'bullish'
        };
      }
    }
  } else {
    // Bearish: look for pivot highs on RSI
    const pivotHighs = findPivotHighs(rsiValues, lbL, lbR);
    const positions: number[] = [];
    for (let i = 0; i < pivotHighs.length; i++) {
      if (pivotHighs[i]) positions.push(i);
    }
    for (let k = positions.length - 1; k >= 1; k--) {
      const curr = positions[k];
      const prev = positions[k - 1];
      const barsBetween = curr - prev;
      if (barsBetween < rangeLower || barsBetween > rangeUpper) continue;

      const oscCurr = rsiValues[curr];
      const oscPrev = rsiValues[prev];
      const priceCurr = candles[curr].high;
      const pricePrev = candles[prev].high;

      // Regular bearish: price higher high, RSI lower high, prev RSI in overbought zone
      if (priceCurr > pricePrev && oscCurr < oscPrev && oscPrev > limitUpper) {
        return {
          prevPivotIdx: prev, currPivotIdx: curr,
          prevPivotPrice: pricePrev, currPivotPrice: priceCurr,
          prevPivotRsi: oscPrev, currPivotRsi: oscCurr,
          type: 'bearish'
        };
      }
    }
  }
  return null;
}

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

// ============================================================
// DYNAMIC PRICE PRECISION — adapts to any coin price level
// ============================================================
function computePricePrecision(price: number): { precision: number; minMove: number } {
  const absPrice = Math.abs(price);
  if (absPrice === 0) return { precision: 8, minMove: 0.00000001 };
  if (absPrice >= 1000) return { precision: 2, minMove: 0.01 };
  if (absPrice >= 1) return { precision: 4, minMove: 0.0001 };
  if (absPrice >= 0.01) return { precision: 6, minMove: 0.000001 };
  if (absPrice >= 0.0001) return { precision: 8, minMove: 0.00000001 };
  // Ultra-low price (meme coins etc.)
  return { precision: 10, minMove: 0.0000000001 };
}

interface Signal {
  id: string;
  symbol: string;
  timeframe: string;
  signalType: 'BUY' | 'SELL';
  detectedAt: Date | string;
  price: number | string;
  metadata?: Record<string, unknown>;
  [key: string]: any; // Allow arbitrary props for signals
}

interface InteractiveLiveChartProps {
  candles: Candle[];
  signal?: Signal;
  /** Same-symbol same-timeframe CISD rows (for MSS markers + level lines). */
  relatedSignals?: Signal[];
  symbol: string;
  timeframe: string;
  height?: number;
  isFullscreen?: boolean;
  isFloating?: boolean;
  onPriceUpdate?: (price: number, change: number) => void;
  onCandleUpdate?: (candle: Candle) => void;
}

export function InteractiveLiveChart({
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
}: InteractiveLiveChartProps) {
  const { theme } = useTheme();
  const userTimezone = useAuthStore((s) => s.user?.timezone);
  const isDark = theme === 'dark';
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  // RSI sub-chart refs
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showTradingView, setShowTradingView] = useState(false);
  const [, setCurrentPrice] = useState<number | null>(null);
  const [, setPriceChange] = useState<number>(0);
  const [, setLastUpdateTime] = useState<Date | null>(null);
  const [, setIctBias] = useState<{ bias: string; message: string } | null>(null);


  const candlesRef = useRef<Candle[]>([]);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoZoomedRef = useRef(false);
  const autoZoomKeyRef = useRef<string>('');

  // Reset auto-zoom when the chart context changes
  useEffect(() => {
    const key = `${symbol}::${timeframe}::${signal?.id || ''}`;
    if (autoZoomKeyRef.current !== key) {
      autoZoomKeyRef.current = key;
      hasAutoZoomedRef.current = false;
    }
  }, [symbol, timeframe, signal?.id]);

  // Fetch ICT Bias
  useEffect(() => {
    if (!candles || candles.length < 3) return;

    const fetchBias = async () => {
      try {
        // Send last 10 candles to optimize payload
        const recentCandles = candles.slice(-10);
        const result = await detectICTBias(recentCandles);
        setIctBias(result);
      } catch {
        // ignore ICT bias fetch errors
      }
    };

    // Debounce fetch
    const timeout = setTimeout(fetchBias, 2000);
    return () => clearTimeout(timeout);
  }, [candles.length, symbol, timeframe]); // Only re-fetch when candle count changes (new candle) or context changes

  // Initialize chart
  useEffect(() => {
    if (showTradingView || !chartContainerRef.current) return;

    // Clean up previous chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (error) {
        // Ignore cleanup errors
      }
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      setIsInitialized(false);
    }

    // Wait for container to have dimensions
    let retryCount = 0;
    const maxRetries = 25; // Max ~2.5s (25 * 100ms) — faster fail-open if container has no layout yet
    const retryTimeouts: ReturnType<typeof setTimeout>[] = [];

    const initChart = () => {
      if (!chartContainerRef.current) {
        if (retryCount < maxRetries) {
          retryCount++;
          retryTimeouts.push(setTimeout(initChart, 100));
        }
        return;
      }

      const container = chartContainerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight || (isFullscreen ? window.innerHeight - 100 : height);

      if (containerWidth === 0 || containerHeight === 0) {
        if (retryCount < maxRetries) {
          retryCount++;
          retryTimeouts.push(setTimeout(initChart, 100));
        }
        return;
      }

      // Ensure minimum dimensions
      const chartWidth = Math.max(containerWidth, 100);
      const isRsi = isRsiDivergenceSignalId(signal?.id);
      // Don't subtract RSI panel height here — the CSS layout handles container sizing.
      // The chart fills whatever height its container has.
      const chartHeight = Math.max(containerHeight, 200);

      try {
        // Verify createChart is available
        if (typeof createChart !== 'function') {
          return;
        }

        const chartTz = useAuthStore.getState().user?.timezone ?? undefined;
        const chartLocalization = {
          locale: 'en-GB' as const,
          dateFormat: "dd MMM 'yy" as const,
          timeFormatter: (t: Time) => formatChartTimeForUser(t, chartTz),
        };
        const tickMarkFormatter = (time: Time, _tickMarkType: TickMarkType) =>
          formatChartTimeForUser(time, chartTz);

        const chart = createChart(container, {
          localization: chartLocalization,
          layout: {
            background: { type: ColorType.Solid, color: isDark ? '#131722' : '#ffffff' },
            textColor: isDark ? '#ffffff' : '#1a1a1a',
            fontSize: 11,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            attributionLogo: false,
          },
          grid: {
            vertLines: {
              color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
              style: 1, // Dotted
              visible: true,
            },
            horzLines: {
              color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
              style: 1, // Dotted
              visible: true,
            },
          },
          width: chartWidth,
          height: chartHeight,
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: isRsi ? 'transparent' : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(19, 236, 55, 0.15)'),
            rightOffset: 5,
            barSpacing: 10,
            minBarSpacing: 3,
            visible: !isRsi,
            tickMarkFormatter,
          },
          rightPriceScale: {
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(19, 236, 55, 0.15)',
            scaleMargins: {
              top: 0.1,
              bottom: 0.1,
            },
          },
          crosshair: {
            mode: 1, // Normal mode
            vertLine: {
              color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.1)',
              width: 1,
              style: 1, // Dotted
              labelBackgroundColor: isDark ? '#13ec37' : '#13ec37',
            },
            horzLine: {
              color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.1)',
              width: 1,
              style: 1, // Dotted
              labelBackgroundColor: isDark ? '#13ec37' : '#13ec37',
            },
          },
        });

        if (!chart) {
          return;
        }

        // Add candlestick series using v4.x API
        // Price format will be set dynamically when data arrives
        let candlestickSeries;
        try {
          candlestickSeries = chart.addCandlestickSeries({
            upColor: '#089981',
            downColor: '#F23645',
            borderVisible: true,
            borderUpColor: '#089981',
            borderDownColor: '#F23645',
            wickUpColor: '#089981',
            wickDownColor: '#F23645',
          });
        } catch (seriesError) {
          return;
        }

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;

        // === RSI SUB-CHART (only for RSIDIVERGENCE signals) ===
        const isRsiSignal = isRsiDivergenceSignalId(signal?.id);
        if (isRsiSignal && rsiContainerRef.current) {
          const rsiHeight = isFullscreen ? 200 : 180;
          const rsiChart = createChart(rsiContainerRef.current, {
            localization: chartLocalization,
            layout: {
              background: { type: ColorType.Solid, color: isDark ? '#0a0e0b' : '#ffffff' },
              textColor: isDark ? '#9ca3af' : '#6b7280',
              fontSize: 10,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              attributionLogo: false,
            },
            grid: {
              vertLines: { color: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)', visible: true },
              horzLines: { color: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)', visible: true },
            },
            width: containerWidth,
            height: rsiHeight,
            timeScale: {
              timeVisible: true,
              secondsVisible: false,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
              rightOffset: 5,
              barSpacing: 10,
              minBarSpacing: 3,
              tickMarkFormatter,
            },
            rightPriceScale: {
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
              scaleMargins: { top: 0.05, bottom: 0.05 },
            },
            crosshair: {
              mode: 1,
              vertLine: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', width: 1, style: 0, labelBackgroundColor: isDark ? '#eab308' : '#eab308' },
              horzLine: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', width: 1, style: 0, labelBackgroundColor: isDark ? '#eab308' : '#eab308' },
            },
          });

          // Add RSI line series (yellow like TradingView)
          const rsiLine = rsiChart.addLineSeries({
            color: '#eab308',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'RSI 14',
          });

          // Add horizontal levels (30, 50, 70)
          const level30 = rsiChart.addLineSeries({ color: isDark ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.5)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, title: '' });
          const level50 = rsiChart.addLineSeries({ color: isDark ? 'rgba(156,163,175,0.3)' : 'rgba(156,163,175,0.4)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, title: '' });
          const level70 = rsiChart.addLineSeries({ color: isDark ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.5)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, title: '' });

          rsiChartRef.current = rsiChart;
          rsiSeriesRef.current = rsiLine;
          (rsiChart as any).level30 = level30;
          (rsiChart as any).level50 = level50;
          (rsiChart as any).level70 = level70;

          // Sync time scales between price and RSI charts
          chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
            if (range && rsiChartRef.current) {
              rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
            }
          });
          rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
            if (range && chartRef.current) {
              chartRef.current.timeScale().setVisibleLogicalRange(range);
            }
          });
        }

        setIsInitialized(true);

        // Handle resize
        const handleResize = () => {
          // Preserve the visible range to prevent the chart from \"jumping\"
          // (e.g. snapping to the far right) when the container is reflowed.
          const mainRange = chartRef.current?.timeScale().getVisibleLogicalRange();
          const rsiRange = rsiChartRef.current?.timeScale().getVisibleLogicalRange();

          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
              height: chartContainerRef.current.clientHeight || 200,
            });
          }
          if (rsiContainerRef.current && rsiChartRef.current) {
            rsiChartRef.current.applyOptions({
              width: rsiContainerRef.current.clientWidth,
              height: rsiContainerRef.current.clientHeight || 180,
            });
          }

          // Re-apply the previous ranges (best-effort; ignore failures).
          try {
            if (mainRange && chartRef.current) {
              chartRef.current.timeScale().setVisibleLogicalRange(mainRange as any);
            }
          } catch (e) { /* ignore */ }
          try {
            if (rsiRange && rsiChartRef.current) {
              rsiChartRef.current.timeScale().setVisibleLogicalRange(rsiRange as any);
            }
          } catch (e) { /* ignore */ }
        };

        window.addEventListener('resize', handleResize);

        // Observe container size changes so only THIS chart resizes.
        const ro = new ResizeObserver(() => {
          // Use rAF to avoid resize loops
          requestAnimationFrame(handleResize);
        });
        if (chartContainerRef.current) ro.observe(chartContainerRef.current);
        if (rsiContainerRef.current) ro.observe(rsiContainerRef.current);

        // Cleanup function
        return () => {
          window.removeEventListener('resize', handleResize);
          try { ro.disconnect(); } catch (e) { /* ignore */ }
          if (chartRef.current) {
            try {
              const cisdC = (chartRef.current as any)._cisdCleanup as (() => void) | undefined;
              if (cisdC) cisdC();
              const tvC = (chartRef.current as any)._tvLabelsCleanup as (() => void) | undefined;
              if (tvC) tvC();
              // Clean up special lines
              if ((chartRef.current as any).seSLLine) {
                chartRef.current.removeSeries((chartRef.current as any).seSLLine);
              }
              if ((chartRef.current as any).seTP1Line) {
                chartRef.current.removeSeries((chartRef.current as any).seTP1Line);
              }
              if ((chartRef.current as any).seTP2Line) {
                chartRef.current.removeSeries((chartRef.current as any).seTP2Line);
              }
              if ((chartRef.current as any).displacementLine) {
                chartRef.current.removeSeries((chartRef.current as any).displacementLine);
              }
              if ((chartRef.current as any).divergencePriceLine) {
                chartRef.current.removeSeries((chartRef.current as any).divergencePriceLine);
              }
              chartRef.current.remove();
            } catch (error) {
              // ignore cleanup errors
            }
            chartRef.current = null;
            candlestickSeriesRef.current = null;
          }
          // Clean up RSI chart
          if (rsiChartRef.current) {
            try { rsiChartRef.current.remove(); } catch (e) { /* ignore */ }
            rsiChartRef.current = null;
            rsiSeriesRef.current = null;
          }
          setIsInitialized(false);
        };
      } catch (error) {
        // ignore chart initialization errors
        return;
      }
    };

    const timeoutId = setTimeout(initChart, 50);

    return () => {
      clearTimeout(timeoutId);
      retryTimeouts.forEach((id) => clearTimeout(id));
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch (e) { /* ignore */ }
        chartRef.current = null;
        candlestickSeriesRef.current = null;
      }
      if (rsiChartRef.current) {
        try { rsiChartRef.current.remove(); } catch (e) { /* ignore */ }
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
      }
      setIsInitialized(false);
    };
  }, [height, isFullscreen, theme, isDark, showTradingView]);

  // Keep axis labels / crosshair in sync with profile timezone (not browser default).
  useEffect(() => {
    if (!isInitialized || !chartRef.current) return;
    const tz = userTimezone ?? undefined;
    const loc = {
      locale: 'en-GB' as const,
      dateFormat: "dd MMM 'yy" as const,
      timeFormatter: (t: Time) => formatChartTimeForUser(t, tz),
    };
    const tickMarkFormatter = (time: Time, _tickMarkType: TickMarkType) =>
      formatChartTimeForUser(time, tz);
    chartRef.current.applyOptions({
      localization: loc,
      timeScale: { tickMarkFormatter },
    });
    rsiChartRef.current?.applyOptions({
      localization: loc,
      timeScale: { tickMarkFormatter },
    });
  }, [isInitialized, userTimezone]);

  // Update chart with candles data (with performance optimization)
  useEffect(() => {
    if (!isInitialized || !candlestickSeriesRef.current || !chartRef.current || candles.length === 0) {
      return;
    }

    // Limit candles to prevent performance issues (keep last 3000 candles for better chart view)
    const maxCandles = 3000;
    const candlesToUse = candles.length > maxCandles ? candles.slice(-maxCandles) : candles;

    try {
      // Prepare candlestick data
      const rawChartData = candlesToUse.map((candle) => ({
        time: Math.floor(new Date(candle.openTime).getTime() / 1000) as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));

      // Deduplicate by timestamp — lightweight-charts crashes on duplicate times
      const seenTimes = new Set<number>();
      const chartData = rawChartData.filter(c => {
        const t = c.time as number;
        if (seenTimes.has(t)) return false;
        seenTimes.add(t);
        return true;
      });

      // Dynamically compute price precision from the data
      const samplePrice = chartData.length > 0 ? chartData[chartData.length - 1].close : 1;
      const { precision: dynamicPrecision, minMove: dynamicMinMove } = computePricePrecision(samplePrice);
      try {
        candlestickSeriesRef.current.applyOptions({
          priceFormat: {
            type: 'price',
            precision: dynamicPrecision,
            minMove: dynamicMinMove,
          },
        });
      } catch (e) { /* ignore if applyOptions fails */ }

      // Update series
      candlestickSeriesRef.current.setData(chartData);

      if (!signal && chartRef.current) {
        const tvc = (chartRef.current as any)._tvLabelsCleanup as (() => void) | undefined;
        if (tvc) {
          tvc();
          (chartRef.current as any)._tvLabelsCleanup = undefined;
        }
        try {
          candlestickSeriesRef.current.setMarkers([]);
        } catch {
          /* ignore */
        }
      }

      // Update current price
      if (candlesToUse.length > 0) {
        const lastCandle = candlesToUse[candlesToUse.length - 1];
        const prevCandle = candlesToUse.length > 1 ? candlesToUse[candlesToUse.length - 2] : null;

        // Ensure current price isn't null and we only send updates when the price actually changes
        setCurrentPrice((prevPrice) => {
          if (prevPrice !== lastCandle.close) {
             const change = prevCandle ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0;
             if (onPriceUpdate) {
               // Use a small delay to prevent React setState-in-render issues
               setTimeout(() => onPriceUpdate(lastCandle.close, change), 0);
             }
             setPriceChange(change);
          }
          return lastCandle.close;
        });
      }

      // Add signal marker and special visual elements if signal exists
      if (signal && chartRef.current && chartData.length > 0) {
        // Clean up previous CISD overlay series
        const prevCleanup = (chartRef.current as any)._cisdCleanup as (() => void) | undefined;
        if (prevCleanup) {
          prevCleanup();
          (chartRef.current as any)._cisdCleanup = undefined;
        }

        const prevTvLabels = (chartRef.current as any)._tvLabelsCleanup as (() => void) | undefined;
        if (prevTvLabels) {
          prevTvLabels();
          (chartRef.current as any)._tvLabelsCleanup = undefined;
        }

        // Find the candle that matches the signal detection time
        const signalDetectedTime = Math.floor(new Date(signal.detectedAt).getTime() / 1000);

        let signalCandleIndex = -1;
        let bestDiff = Infinity;
        for (let i = 0; i < chartData.length; i++) {
          const candleTime = chartData[i].time as number;
          const diff = Math.abs(candleTime - signalDetectedTime);
          if (diff < bestDiff) {
            bestDiff = diff;
            signalCandleIndex = i;
          }
        }

        let cisdMulti = false;
        if (isCisdFamilySignal(signal) && candlestickSeriesRef.current) {
          const siblings = (relatedSignals ?? []).filter(
            (r) => r.symbol === symbol && r.timeframe === timeframe,
          );
          const alreadyIncluded = siblings.some((r) => r.id === signal.id);
          const overlaySignals = alreadyIncluded ? siblings : [signal, ...siblings];

          cisdMulti = true;
          (chartRef.current as any)._cisdCleanup = drawCisdOverlays(
            chartRef.current as any,
            candlestickSeriesRef.current as any,
            chartData as any,
            overlaySignals.map((s) => ({
              detectedAt: s.detectedAt,
              signalType: s.signalType,
              price: s.price,
              metadata: (s.metadata ?? {}) as Record<string, unknown>,
            })),
            {
              overlayHost: chartContainerRef.current,
            },
          );
        }

        if (signalCandleIndex >= 0) {
          const signalTime = chartData[signalCandleIndex].time;
          /** When set by RSI divergence block, three TV-style labels; otherwise single default label. */
          let tvLabelItems: TvLabelItem[] | undefined;

          // Get pattern type from metadata for better label
          const patternType = signal.metadata?.type || signal.metadata?.pattern || '';
          const direction = signal.signalType === 'BUY' ? 'LONG' : 'SHORT';

          // Format pattern label
          let patternLabel = '';
          const mssLbl = signal.metadata?.mss_label;
          if (typeof mssLbl === 'string' && mssLbl && isCisdFamilySignal(signal)) {
            patternLabel = mssLbl;
          } else if (typeof patternType === 'string' && patternType) {
            // Remove XL and 2X from label logic
            const formattedType = patternType
              .replace('_PLUS', '+')
              .replace('_XL', '')
              .replace('_2X', '')
              .replace('_', ' ');
            patternLabel = formattedType;
          } else if (!patternLabel) {
            patternLabel = direction;
          }

          const markerShape = signal.signalType === 'BUY' ? 'arrowUp' as const : 'arrowDown' as const;

          const marker = {
            time: signalTime,
            position: signal.signalType === 'BUY' ? 'belowBar' as const : 'aboveBar' as const,
            color: signal.signalType === 'BUY' ? '#089981' : '#F23645',
            shape: markerShape,
            text: patternLabel || direction,
            size: 3, // Increased size for beautiful prominent arrows
          };

          // Add SL / TP1 / TP2 / TP3 lines for SuperEngulfing signals (v3)
          const isSESignal = signal?.id?.startsWith('SUPER_ENGULFING');
          if (isSESignal && signal && chartRef.current && signalCandleIndex >= 0) {
            // Get SE targets — prefer v3 fields, fallback to legacy
            const seSL = signal.current_sl_price ?? signal.sl_price ?? signal.se_current_sl ?? signal.se_sl ?? (signal.metadata as any)?.se_sl;
            const seTP1 = signal.tp1_price ?? signal.se_tp1 ?? (signal.metadata as any)?.se_tp1;
            const seTP2 = signal.tp2_price ?? signal.se_tp2 ?? (signal.metadata as any)?.se_tp2;
            const seTP3 = signal.tp3_price ?? (signal.metadata as any)?.tp3_price;

            const lineStartIdx = Math.max(0, signalCandleIndex - 5);
            const lineStart = chartData[lineStartIdx].time as any;
            const lineEnd = chartData[chartData.length - 1].time as any;

            // Clean up previous SE lines
            if ((chartRef.current as any).seSLLine) {
              try { chartRef.current.removeSeries((chartRef.current as any).seSLLine); } catch (e) { }
            }
            if ((chartRef.current as any).seTP1Line) {
              try { chartRef.current.removeSeries((chartRef.current as any).seTP1Line); } catch (e) { }
            }
            if ((chartRef.current as any).seTP2Line) {
              try { chartRef.current.removeSeries((chartRef.current as any).seTP2Line); } catch (e) { }
            }
            if ((chartRef.current as any).seTP3Line) {
              try { chartRef.current.removeSeries((chartRef.current as any).seTP3Line); } catch (e) { }
            }

            if (lineStart < lineEnd) {
              // SL line (red dashed)
              if (seSL) {
                const seSLLine = chartRef.current.addLineSeries({
                  color: '#F23645',
                  lineWidth: 2,
                  lineStyle: 2, // Dashed
                  priceLineVisible: true,
                  lastValueVisible: true,
                  title: signal.tp1_hit ? 'SL (BE)' : 'SL',
                });
                seSLLine.setData([
                  { time: lineStart, value: Number(seSL) },
                  { time: lineEnd, value: Number(seSL) },
                ]);
                (chartRef.current as any).seSLLine = seSLLine;
              }

              // TP1 line (amber dotted) — 1.5R
              if (seTP1) {
                const tp1Line = chartRef.current.addLineSeries({
                  color: '#f59e0b',
                  lineWidth: 1,
                  lineStyle: 1, // Dotted
                  priceLineVisible: true,
                  lastValueVisible: true,
                  title: signal.tp1_hit ? 'TP1 (1.5R) ✓' : 'TP1 (1.5R)',
                });
                tp1Line.setData([
                  { time: lineStart, value: Number(seTP1) },
                  { time: lineEnd, value: Number(seTP1) },
                ]);
                (chartRef.current as any).seTP1Line = tp1Line;
              }

              // TP2 line (cyan dotted) — 2R
              if (seTP2) {
                const tp2Line = chartRef.current.addLineSeries({
                  color: '#22d3ee',
                  lineWidth: 1,
                  lineStyle: 1, // Dotted
                  priceLineVisible: true,
                  lastValueVisible: true,
                  title: signal.tp2_hit ? 'TP2 (2R) ✓' : 'TP2 (2R)',
                });
                tp2Line.setData([
                  { time: lineStart, value: Number(seTP2) },
                  { time: lineEnd, value: Number(seTP2) },
                ]);
                (chartRef.current as any).seTP2Line = tp2Line;
              }

              // TP3 line (green solid) — 3R
              if (seTP3) {
                const seTP1Line = chartRef.current.addLineSeries({
                  color: '#089981',
                  lineWidth: 2,
                  lineStyle: 0, // Solid
                  priceLineVisible: true,
                  lastValueVisible: true,
                  title: signal.tp3_hit ? 'TP3 (3R) ✓' : 'TP3 (3R)',
                });
                seTP1Line.setData([
                  { time: lineStart, value: Number(seTP3) },
                  { time: lineEnd, value: Number(seTP3) },
                ]);
                (chartRef.current as any).seTP3Line = seTP1Line;
              }
            }
          }

          // Add displacement line (from signal point)
          if (signalCandleIndex >= 0 && signalCandleIndex < chartData.length) {
            const signalCandle = chartData[signalCandleIndex];

            // Clean up previous line if exists
            if ((chartRef.current as any).displacementLine) {
              try {
                chartRef.current.removeSeries((chartRef.current as any).displacementLine);
              } catch (e) {
                // Ignore cleanup errors
              }
            }

            const displacementLine = chartRef.current.addLineSeries({
              color: signal.signalType === 'BUY' ? '#089981' : '#F23645',
              lineWidth: 2,
              lineStyle: 0, // Solid
              priceLineVisible: true,
              lastValueVisible: true,
              title: 'Entry Price',
            });

            // Use signal price if available, otherwise use candle close
            const entryPrice = typeof signal.price === 'number' ? signal.price : signalCandle.close;

            // Fix type error for Time arithmetic in v4
            const entryStartTime = signalTime as any;
            const entryEndTime = chartData[chartData.length - 1].time as any;

            if (entryStartTime < entryEndTime) {
              displacementLine.setData([
                { time: entryStartTime, value: entryPrice },
                { time: entryEndTime, value: entryPrice },
              ]);
              // Store reference for cleanup
              (chartRef.current as any).displacementLine = displacementLine;
            } else {
              chartRef.current.removeSeries(displacementLine);
            }
          }

          // === ICT BIAS LEVEL LINES ===
          const isBiasSignal = signal?.id?.startsWith('ICT_BIAS');
          if (isBiasSignal && chartRef.current) {
            const biasMetadata = signal.metadata as any;
            const biasUpperLevel = biasMetadata?.prevHigh;
            const biasLowerLevel = biasMetadata?.prevLow;
            const biasType = biasMetadata?.bias; // 'BULLISH' | 'BEARISH'
            const biasLevel = signal.bias_level ?? biasMetadata?.bias_level;

            // Clean up previous bias lines
            if ((chartRef.current as any).biasUpperLine) {
              try { chartRef.current.removeSeries((chartRef.current as any).biasUpperLine); } catch (e) { /* ignore */ }
            }
            if ((chartRef.current as any).biasLowerLine) {
              try { chartRef.current.removeSeries((chartRef.current as any).biasLowerLine); } catch (e) { /* ignore */ }
            }
            if ((chartRef.current as any).biasLevelLine) {
              try { chartRef.current.removeSeries((chartRef.current as any).biasLevelLine); } catch (e) { /* ignore */ }
            }

            // Start line ~20 candles before signal for better visual context
            const lineStartIdx = Math.max(0, signalCandleIndex - 20);
            const lineStart = chartData[lineStartIdx].time as any;
            const lineEnd = chartData[chartData.length - 1].time as any;

            // Strict inequality — lightweight-charts crashes if start === end
            if (lineStart < lineEnd) {
              if (biasUpperLevel && biasLowerLevel) {
                // Upper level line (Candle B's high)
                const biasUpperLine = chartRef.current.addLineSeries({
                  color: biasType === 'BULLISH' ? '#089981' : '#888888',
                  lineWidth: 2,
                  lineStyle: 2, // Dashed
                  priceLineVisible: true,
                  lastValueVisible: true,
                  title: biasType === 'BULLISH'
                    ? '▲ Bullish — Expect higher'
                    : 'Upper Level',
                });
                biasUpperLine.setData([
                  { time: lineStart, value: Number(biasUpperLevel) },
                  { time: lineEnd, value: Number(biasUpperLevel) },
                ]);
                (chartRef.current as any).biasUpperLine = biasUpperLine;

                // Lower level line (Candle B's low)
                const biasLowerLine = chartRef.current.addLineSeries({
                  color: biasType === 'BEARISH' ? '#F23645' : '#888888',
                  lineWidth: 2,
                  lineStyle: 2, // Dashed
                  priceLineVisible: true,
                  lastValueVisible: true,
                  title: biasType === 'BEARISH'
                    ? '▼ Bearish — Expect lower'
                    : 'Lower Level',
                });
                biasLowerLine.setData([
                  { time: lineStart, value: Number(biasLowerLevel) },
                  { time: lineEnd, value: Number(biasLowerLevel) },
                ]);
                (chartRef.current as any).biasLowerLine = biasLowerLine;
              }

              // Bias Level line (the close price that confirmed bias — validation level)
              if (biasLevel) {
                const biasLevelLine = chartRef.current.addLineSeries({
                  color: '#00bcd4', // Cyan
                  lineWidth: 2,
                  lineStyle: 1, // Dotted
                  priceLineVisible: true,
                  lastValueVisible: true,
                  title: '📍 Bias Level',
                });
                biasLevelLine.setData([
                  { time: chartData[signalCandleIndex].time as any, value: Number(biasLevel) },
                  { time: lineEnd, value: Number(biasLevel) },
                ]);
                (chartRef.current as any).biasLevelLine = biasLevelLine;
              }
            }
          }

          // === RSI DIVERGENCE TREND LINES (computed from candle data) ===
          const metadata = signal.metadata as any;
          const isRsiDiv = isRsiDivergenceSignalId(signal?.id);
          if (isRsiDiv && candlesToUse.length > 30) {
            const closes = candlesToUse.map(c => c.close);
            const rsiVals = calculateRSI(closes, 14);
            const divResult = detectLastDivergence(
              candlesToUse as any, rsiVals,
              signal.signalType as 'BUY' | 'SELL',
              metadata?.divergenceType || ''
            );

            if (divResult) {
              // Clean up previous divergence line if exists
              if ((chartRef.current as any).divergencePriceLine) {
                try { chartRef.current.removeSeries((chartRef.current as any).divergencePriceLine); } catch (e) { /* ignore */ }
              }

              const prevPivotTimeSec = Math.floor(new Date(candlesToUse[divResult.prevPivotIdx].openTime).getTime() / 1000) as Time;
              const currPivotTimeSec = Math.floor(new Date(candlesToUse[divResult.currPivotIdx].openTime).getTime() / 1000) as Time;
              const isBullish = divResult.type === 'bullish';
              const lineColor = isBullish ? '#089981' : '#F23645';
              const divergencePriceLine = chartRef.current.addLineSeries({
                color: lineColor,
                lineWidth: 3,
                lineStyle: 0,
                priceLineVisible: false,
                lastValueVisible: false,
                title: isBullish ? '↗ Bullish Divergence' : '↘ Bearish Divergence',
              });

              divergencePriceLine.setData([
                { time: prevPivotTimeSec, value: divResult.prevPivotPrice },
                { time: currPivotTimeSec, value: divResult.currPivotPrice },
              ]);
              (chartRef.current as any).divergencePriceLine = divergencePriceLine;

              const anchorY =
                (chartData[signalCandleIndex].high + chartData[signalCandleIndex].low) / 2;
              const pivotVariant = isBullish ? 'bull' : 'bear';
              const pivotPtr = isBullish ? 'up' : 'down';
              const sigPtr = signal.signalType === 'BUY' ? 'up' : 'down';
              tvLabelItems = [
                {
                  time: signalTime,
                  price: anchorY,
                  text: patternLabel || direction,
                  variant: signal.signalType === 'BUY' ? 'bull' : 'bear',
                  pointer: sigPtr,
                },
                {
                  time: prevPivotTimeSec,
                  price: divResult.prevPivotPrice,
                  text: 'Pivot 1',
                  variant: pivotVariant,
                  pointer: pivotPtr,
                },
                {
                  time: currPivotTimeSec,
                  price: divResult.currPivotPrice,
                  text: 'Pivot 2',
                  variant: pivotVariant,
                  pointer: pivotPtr,
                },
              ].sort((a, b) => (a.time as number) - (b.time as number));
            }
          }

          if (!cisdMulti) {
            try {
              if (tvLabelItems) {
                const lineColor = tvLabelItems[1]?.variant === 'bull' ? '#089981' : '#F23645';
                const isBullish = tvLabelItems[1]?.variant === 'bull';
                const allMarkers = [
                  {
                    time: tvLabelItems[0].time,
                    position:
                      tvLabelItems[0].pointer === 'up'
                        ? ('belowBar' as const)
                        : ('aboveBar' as const),
                    color:
                      tvLabelItems[0].variant === 'bull' ? '#089981' : '#F23645',
                    shape:
                      tvLabelItems[0].variant === 'bull'
                        ? ('arrowUp' as const)
                        : ('arrowDown' as const),
                    text: tvLabelItems[0].text,
                    size: 3,
                  },
                  {
                    time: tvLabelItems[1].time,
                    position: isBullish ? ('belowBar' as const) : ('aboveBar' as const),
                    color: lineColor,
                    shape: 'circle' as const,
                    text: 'Pivot 1',
                    size: 2,
                  },
                  {
                    time: tvLabelItems[2].time,
                    position: isBullish ? ('belowBar' as const) : ('aboveBar' as const),
                    color: lineColor,
                    shape: 'circle' as const,
                    text: 'Pivot 2',
                    size: 2,
                  },
                ].sort((a, b) => (a.time as number) - (b.time as number));
                candlestickSeriesRef.current?.setMarkers(allMarkers);
              } else {
                candlestickSeriesRef.current?.setMarkers([marker]);
              }
            } catch {
              /* ignore */
            }
          }

          // Zoom to signal area ONCE per chart context.
          // Re-applying this on every minor update (or on drag/reflow) causes the chart to \"jump\".
          if (!hasAutoZoomedRef.current) {
            hasAutoZoomedRef.current = true;
            const zoomBefore = 70;
            const zoomAfter = 30; // 30% empty space on the right
            const logicalFrom = Math.max(0, signalCandleIndex - zoomBefore);
            const logicalTo = signalCandleIndex + zoomAfter; // Do not clamp to chartData.length - 1 to allow empty space
            try {
              chartRef.current.timeScale().setVisibleLogicalRange({
                from: logicalFrom,
                to: logicalTo,
              });
            } catch (e) {
              // Fallback to fitContent if setVisibleLogicalRange fails
              chartRef.current.timeScale().fitContent();
            }
          }
        }
      }

      // === RSI SUB-CHART DATA ===
      const isRsiSignal = isRsiDivergenceSignalId(signal?.id);
      if (isRsiSignal && rsiChartRef.current && rsiSeriesRef.current) {
        const closes = candlesToUse.map(c => c.close);
        const rsiValues = calculateRSI(closes, 14);
        const chartTimes = candlesToUse.map(c => Math.floor(new Date(c.openTime).getTime() / 1000) as Time);

        const rsiData: any[] = [];
        for (let i = 0; i < rsiValues.length; i++) {
          if (!isNaN(rsiValues[i]) && rsiValues[i] !== null) {
            rsiData.push({ time: chartTimes[i], value: rsiValues[i] });
          }
        }

        if (rsiData.length > 0) {
          rsiSeriesRef.current.setData(rsiData);

          const levelData30 = chartTimes.map(t => ({ time: t, value: 30 }));
          const levelData50 = chartTimes.map(t => ({ time: t, value: 50 }));
          const levelData70 = chartTimes.map(t => ({ time: t, value: 70 }));

          try {
            (rsiChartRef.current as any).level30?.setData(levelData30);
            (rsiChartRef.current as any).level50?.setData(levelData50);
            (rsiChartRef.current as any).level70?.setData(levelData70);
          } catch (e) { /* ignore level errors */ }

          // === DIVERGENCE TREND LINE ON RSI CHART (computed from candle data) ===
          const rsiMetadata = signal?.metadata as any;
          if (candlesToUse.length > 30) {
            const divResult = detectLastDivergence(
              candlesToUse as any, rsiValues,
              (signal?.signalType || 'BUY') as 'BUY' | 'SELL',
              rsiMetadata?.divergenceType || ''
            );

            if (divResult) {
              // Clean up previous RSI divergence line
              if ((rsiChartRef.current as any).rsiDivergenceLine) {
                try { rsiChartRef.current.removeSeries((rsiChartRef.current as any).rsiDivergenceLine); } catch (e) { /* ignore */ }
              }

              const prevPivotTimeSec = chartTimes[divResult.prevPivotIdx];
              const currPivotTimeSec = chartTimes[divResult.currPivotIdx];
              const isBullish = divResult.type === 'bullish';
              const lineColor = isBullish ? '#089981' : '#F23645';

              const rsiDivLine = rsiChartRef.current.addLineSeries({
                color: lineColor,
                lineWidth: 3,
                lineStyle: 0,
                priceLineVisible: false,
                lastValueVisible: false,
                title: '',
              });

              rsiDivLine.setData([
                { time: prevPivotTimeSec, value: divResult.prevPivotRsi },
                { time: currPivotTimeSec, value: divResult.currPivotRsi },
              ]);
              (rsiChartRef.current as any).rsiDivergenceLine = rsiDivLine;

              // Add circle markers on RSI divergence line
              rsiDivLine.setMarkers([
                { time: prevPivotTimeSec, position: isBullish ? 'belowBar' as const : 'aboveBar' as const, color: lineColor, shape: 'circle' as const, text: '', size: 1 },
                { time: currPivotTimeSec, position: isBullish ? 'belowBar' as const : 'aboveBar' as const, color: lineColor, shape: 'circle' as const, text: '', size: 1 },
              ]);
            }
          }

          // Fit RSI chart and sync with price chart
          rsiChartRef.current.timeScale().fitContent();
        }
      }
    } catch {
      // ignore chart data update errors
    }
  }, [candles, signal, relatedSignals, symbol, timeframe, isInitialized]);

  // Update chart theme when theme changes
  useEffect(() => {
    if (!chartRef.current || !isInitialized) return;

    try {
      chartRef.current.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: isDark ? '#131722' : '#ffffff' },
          textColor: isDark ? '#ffffff' : '#1a1a1a',
          fontSize: 11,
        },
        grid: {
          vertLines: {
            color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
            style: 1,
            visible: true,
          },
          horzLines: {
            color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
            style: 1,
            visible: true,
          },
        },
        timeScale: {
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)',
        },
        rightPriceScale: {
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)',
        },
        crosshair: {
          vertLine: {
            color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.1)',
            style: 1,
          },
          horzLine: {
            color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.1)',
            style: 1,
          },
        },
      });
    } catch {
      // ignore theme update errors
    }
  }, [theme, isDark, isInitialized]);

  // Update candles ref when candles prop changes
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  // Handle real-time candle updates with performance optimization
  const handleCandleUpdate = useCallback((newCandle: Candle) => {
    if (newCandle.symbol === symbol && newCandle.timeframe === timeframe) {
      if (candlestickSeriesRef.current) {
        const formattedTime = Math.floor(new Date(newCandle.openTime).getTime() / 1000) as Time;
        const tickData = {
          time: formattedTime,
          open: newCandle.open,
          high: newCandle.high,
          low: newCandle.low,
          close: newCandle.close,
        };

        // O(1) native update to Lightweight Charts
        requestAnimationFrame(() => {
          try {
            candlestickSeriesRef.current?.update(tickData);
          } catch (e) {
            // Error when appending out-of-order candle, fallback to silent ignore
            // as setData will correct it on next initial load
          }
        });

        // Update internal refs for indicator maths (does not trigger React render directly)
        const updatedCandles = [...candlesRef.current];
        const index = updatedCandles.findIndex(
          c => new Date(c.openTime).getTime() === new Date(newCandle.openTime).getTime()
        );
        let isNewCandle = false;
        if (index >= 0) {
          updatedCandles[index] = newCandle;
        } else {
          updatedCandles.push(newCandle);
          // Keep array sorted
          updatedCandles.sort((a, b) => new Date(a.openTime).getTime() - new Date(b.openTime).getTime());
          isNewCandle = true;
          // Trigger a re-render only when a NEW candle arrives to calculate indicators
          setLastUpdateTime(new Date());
        }
        candlesRef.current = updatedCandles;

        // Update price display state
        if (updatedCandles.length > 0) {
          const lastCandle = updatedCandles[updatedCandles.length - 1];
          const prevCandle = updatedCandles.length > 1 ? updatedCandles[updatedCandles.length - 2] : null;

          setCurrentPrice((prevPrice) => {
            if (prevPrice !== lastCandle.close) {
              const change = prevCandle ? ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100 : 0;
              if (onPriceUpdate) {
                // Use a small delay to prevent React setState-in-render issues
                setTimeout(() => onPriceUpdate(lastCandle.close, change), 0);
              }
              setPriceChange(change);
            }
            return lastCandle.close;
          });
        }

        // Notify parent ONLY on new candle close so it doesn't cause massive O(N) array re-renders
        if (onCandleUpdate && isNewCandle) {
          onCandleUpdate(newCandle);
        }
      }
    }
  }, [symbol, timeframe, onPriceUpdate, onCandleUpdate]);

  // Subscribe to WebSocket updates
  useEffect(() => {
    if (!symbol || !timeframe) return;

    // Subscribe to symbol updates
    wsService.subscribeToSymbol(symbol, timeframe);
    wsService.on('candle:update', handleCandleUpdate);

    return () => {
      wsService.off('candle:update', handleCandleUpdate);
      wsService.unsubscribeFromSymbol(symbol, timeframe);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [symbol, timeframe, handleCandleUpdate]);

  // Chart toolbar functions
  const handleZoomIn = useCallback(() => {
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        const from = visibleRange.from as any as number;
        const to = visibleRange.to as any as number;
        const range = to - from;
        const center = (from + to) / 2;
        timeScale.setVisibleRange({
          from: (center - range * 0.7) as any,
          to: (center + range * 0.7) as any,
        });
      }
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        const from = visibleRange.from as any as number;
        const to = visibleRange.to as any as number;
        const range = to - from;
        const center = (from + to) / 2;
        timeScale.setVisibleRange({
          from: (center - range * 1.4) as any,
          to: (center + range * 1.4) as any,
        });
      }
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, []);

  // Convert timeframe to TradingView format
  const getTradingViewTimeframe = useCallback((tf: string): string => {
    const tfLower = tf.toLowerCase();
    if (tfLower === '1m') return '1';
    if (tfLower === '3m') return '3';
    if (tfLower === '5m') return '5';
    if (tfLower === '15m') return '15';
    if (tfLower === '30m') return '30';
    if (tfLower === '1h') return '60';
    if (tfLower === '2h') return '120';
    if (tfLower === '4h') return '240';
    if (tfLower === '6h') return '360';
    if (tfLower === '8h') return '480';
    if (tfLower === '12h') return '720';
    if (tfLower === '1d') return 'D';
    if (tfLower === '3d') return '3D';
    if (tfLower === '1w') return 'W';
    if (tfLower === '1M') return 'M';
    return '240'; // Default to 4h
  }, []);



  return (
    <div className="relative w-full h-full chart-container flex flex-col">
      {/* Toolbar — above the chart, not overlapping */}
      {!isFloating && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative flex items-center justify-center px-3 py-2 rounded-t-2xl glass-panel border dark:border-white/5 light:border-green-200 border-b-0 shrink-0"
        >
          <div className="absolute left-3 items-center gap-2 flex">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-400 hidden lg:inline">
              {showTradingView ? 'TradingView' : 'Interactive Live Chart'}{signal ? `: ${signal.metadata?.biasType || signal.strategyType?.replace('_', ' ')}` : ''}
            </span>
            <div className="flex items-center gap-0.5 lg:hidden">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="text-[10px] font-mono text-primary font-bold">Live</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0 px-2">
            {!showTradingView && (
              <div className="flex items-center gap-1">
                <motion.button
                  whileHover={{ scale: 1.15, color: '#13ec37' }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleZoomIn}
                  className="p-1 rounded dark:text-gray-400 light:text-text-dark transition-colors duration-300"
                  title="Zoom In"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </motion.button>
                <div className="w-px h-3.5 dark:bg-white/10 light:bg-green-300 mx-0.5"></div>
                <motion.button
                  whileHover={{ scale: 1.15, color: '#13ec37' }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleZoomOut}
                  className="p-1 rounded dark:text-gray-400 light:text-text-dark transition-colors duration-300"
                  title="Zoom Out"
                >
                  <span className="material-symbols-outlined text-[18px]">remove</span>
                </motion.button>
                <div className="w-px h-3.5 dark:bg-white/10 light:bg-green-300 mx-0.5"></div>
                <motion.button
                  whileHover={{ scale: 1.15, color: '#13ec37' }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleResetZoom}
                  className="p-1 rounded dark:text-gray-400 light:text-text-dark transition-colors duration-300"
                  title="Reset Zoom"
                >
                  <span className="material-symbols-outlined text-[18px]">fit_screen</span>
                </motion.button>
              </div>
            )}
            {signal && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowTradingView(!showTradingView)}
                className={`flex items-center justify-center p-1.5 rounded-lg transition-all duration-300 ${showTradingView
                  ? 'bg-primary/20 text-primary shadow-[0_0_10px_rgba(19,236,55,0.3)]'
                  : 'dark:bg-white/5 light:bg-green-50 dark:text-gray-300 light:text-text-dark hover:text-primary'
                  }`}
                title={showTradingView ? "Switch to Native Chart" : "Switch to TradingView"}
              >
                {showTradingView ? (
                  <span className="material-symbols-outlined text-[18px] transition-transform duration-500">
                    candlestick_chart
                  </span>
                ) : (
                  <svg className="w-[18px] h-[18px] transition-transform duration-500" viewBox="0 0 42 29" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.981 0L19.227 8H6.73501L12.981 0Z" />
                    <path d="M21.246 0L39.981 24H2.511L21.246 0Z" />
                    <path opacity="0.6" d="M37.746 19L41.981 29H13.491L17.726 19H37.746Z" />
                  </svg>
                )}
              </motion.button>
            )}
          </div>
        </motion.div>
      )}

      {/* Chart Area */}
      <div className="relative w-full flex-1 min-h-0 bg-background-dark/20 backdrop-blur-sm overflow-hidden border dark:border-white/5 light:border-green-200 shadow-2xl" style={{ borderRadius: isFloating ? '1rem' : '0 0 1rem 1rem' }}>
        {/* Initial Green Pulse Animation */}
        <motion.div
          initial={{ opacity: 0.3 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2, ease: "easeOut" }}
          className="absolute inset-0 z-[60] pointer-events-none rounded-b-2xl shadow-[inset_0_0_200px_rgba(19,236,55,0.15)]"
        />

        {/* Texture Overlay */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-20 bg-[url('/grid-texture.png')] bg-repeat opacity-[0.03]"></div>

        {/* TradingView Widget Overlay */}
        {
          showTradingView && (
            <div className="absolute inset-0 z-10 bg-background-dark/95 backdrop-blur-sm">
              <TradingViewWidget
                symbol={symbol}
                interval={getTradingViewTimeframe(timeframe)}
                theme={isDark ? 'dark' : 'light'}
                height="100%"
              />
            </div>
          )
        }

        {/* Charts Container */}
        <div className="w-full relative" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Main Price Chart */}
          <div
            ref={chartContainerRef}
            className="w-full relative overflow-hidden"
            style={isRsiDivergenceSignalId(signal?.id)
              ? { height: `calc(100% - ${isFullscreen ? 200 : 180}px)` }
              : { height: '100%' }
            }
          />

          {/* RSI Sub-Chart (only for RSI divergence signals) */}
          {isRsiDivergenceSignalId(signal?.id) && (
            <div className="w-full relative overflow-hidden" style={{ height: isFullscreen ? 200 : 180, borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.1)' }}>
              <div className="relative w-full h-full">
                <div className="absolute top-1 left-2 z-10 flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)', color: isDark ? '#eab308' : '#ca8a04', border: isDark ? '1px solid rgba(234,179,8,0.2)' : '1px solid rgba(202,138,4,0.3)' }}>
                    RSI 14
                  </span>
                </div>
                <div ref={rsiContainerRef} className="w-full h-full" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
