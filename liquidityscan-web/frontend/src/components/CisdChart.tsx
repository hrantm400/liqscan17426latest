import { useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType, Time, TickMarkType } from 'lightweight-charts';
import { fetchCandles, type ChartCandle } from '../services/candles';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { formatChartTimeForUser } from '../utils/userTimeFormat';
import { drawCisdOverlays, type CandleBar } from '../utils/drawCisdOverlays';
import { detectAllMSS, type CandleData } from '../utils/cisdClientDetector';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '../services/userApi';

type IChartApi = ReturnType<typeof createChart>;

interface CisdChartProps {
  signal: {
    id: string;
    symbol: string;
    timeframe: string;
    detectedAt: string;
    signalType: 'BUY' | 'SELL';
    metadata?: Record<string, unknown>;
  };
  height?: number;
}

function computePricePrecision(price: number): { precision: number; minMove: number } {
  const absPrice = Math.abs(price);
  if (absPrice === 0) return { precision: 8, minMove: 0.00000001 };
  if (absPrice >= 1000) return { precision: 2, minMove: 0.01 };
  if (absPrice >= 1) return { precision: 4, minMove: 0.0001 };
  if (absPrice >= 0.01) return { precision: 6, minMove: 0.000001 };
  if (absPrice >= 0.0001) return { precision: 8, minMove: 0.00000001 };
  return { precision: 10, minMove: 0.0000000001 };
}

export function CisdChart({ signal, height = 500 }: CisdChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const userTimezone = useAuthStore((s) => s.user?.timezone);

  const { data: rawCandles, isLoading: isLoadingCandles, isError: isCandleError } = useQuery({
    queryKey: ['candles', signal.symbol, signal.timeframe, 'cisd-chart', 500],
    queryFn: () => fetchCandles(signal.symbol, signal.timeframe, 500),
    staleTime: 60_000,
    enabled: !!signal.symbol && !!signal.timeframe,
  });

  const { data: config } = useQuery({
    queryKey: ['public', 'site-status'],
    queryFn: () => userApi.getPublicSiteStatus(),
    staleTime: 5 * 60 * 1000,
  });

  const buildChart = useCallback(() => {
    if (!containerRef.current || !rawCandles || rawCandles.length === 0) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* ignore */ }
      chartRef.current = null;
    }

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    if (containerWidth === 0) return;

    const chartTz = userTimezone ?? undefined;
    const tickMarkFormatter = (time: Time, _tickMarkType: TickMarkType) =>
      formatChartTimeForUser(time, chartTz);

    const chart = createChart(container, {
      localization: {
        locale: 'en-GB',
        dateFormat: "dd MMM 'yy",
        timeFormatter: (t: Time) => formatChartTimeForUser(t, chartTz),
      },
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0a0e0b' : '#ffffff' },
        textColor: isDark ? '#ffffff' : '#1a1a1a',
        fontSize: 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(19,236,55,0.05)', visible: true },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(19,236,55,0.05)', visible: true },
      },
      width: containerWidth,
      height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(19,236,55,0.15)',
        rightOffset: 5,
        barSpacing: 10,
        minBarSpacing: 3,
        tickMarkFormatter,
      },
      rightPriceScale: {
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(19,236,55,0.15)',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(19,236,55,0.4)',
          width: 1, style: 0, labelBackgroundColor: '#13ec37',
        },
        horzLine: {
          color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(19,236,55,0.4)',
          width: 1, style: 0, labelBackgroundColor: '#13ec37',
        },
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#13ec37',
      downColor: '#ff4444',
      borderVisible: true,
      borderUpColor: '#13ec37',
      borderDownColor: '#ff4444',
      wickUpColor: '#13ec37',
      wickDownColor: '#ff4444',
    });

    const seenTimes = new Set<number>();
    const chartData: CandleBar[] = rawCandles
      .map((c: ChartCandle) => ({
        time: Math.floor(new Date(c.openTime).getTime() / 1000) as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .filter((c) => {
        const t = c.time as number;
        if (seenTimes.has(t)) return false;
        seenTimes.add(t);
        return true;
      });

    if (chartData.length === 0) return;

    const samplePrice = chartData[chartData.length - 1].close;
    const { precision, minMove } = computePricePrecision(samplePrice);
    candleSeries.applyOptions({ priceFormat: { type: 'price', precision, minMove } });
    candleSeries.setData(chartData);

    const mssCandles: CandleData[] = rawCandles.map((c: ChartCandle) => ({
      openTime: new Date(c.openTime).getTime(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: typeof c.volume === 'number' ? c.volume : Number(c.volume) || 0,
    }));

    const cisdOptions = {
      lbLeft: config?.cisdPivotLeft ?? 5,
      lbRight: config?.cisdPivotRight ?? 2,
      minSeq: config?.cisdMinConsecutive ?? 2,
    };

    // Client-side MSS/Fib/FVG overlays for full visible history (matches scanner logic; not limited by DB row count)
    const historicalCisdItems = detectAllMSS(mssCandles, cisdOptions).map((item) => ({
      detectedAt: new Date(item.time).toISOString(),
      signalType: item.direction,
      price: item.price,
      metadata: {
        mss_level: item.mssLevel,
        fib_50: item.fib50,
        pivot_time: mssCandles[item.pivotBarIndex]?.openTime ?? null,
        reverse_candle_high: Math.max(item.revCandleOpen, item.revCandleClose),
        reverse_candle_low: Math.min(item.revCandleOpen, item.revCandleClose),
        reverse_candle_time: item.revCandleTime,
        has_fvg: item.hasFvg,
        fvg_high: item.fvgHigh,
        fvg_low: item.fvgLow,
        fvg_start_time: item.fvgStartTime,
        mss_label:
          item.mssType === 'HIGH_PROB_MSS'
            ? item.direction === 'BUY'
              ? 'Bull High Prob MSS'
              : 'Bear High Prob MSS'
            : item.direction === 'BUY'
              ? 'Bull MSS'
              : 'Bear MSS',
      },
    }));

    cleanupRef.current = drawCisdOverlays(
      chart as any,
      candleSeries as any,
      chartData,
      historicalCisdItems,
    );

    chart.timeScale().fitContent();
  }, [rawCandles, isDark, height, userTimezone]);

  useEffect(() => {
    buildChart();
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* ignore */ }
        chartRef.current = null;
      }
    };
  }, [buildChart]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) chartRef.current.applyOptions({ width: w });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (isLoadingCandles) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="flex flex-col items-center gap-2 animate-pulse">
          <span className="material-symbols-outlined text-primary/50 text-3xl">refresh</span>
          <span className="text-sm dark:text-gray-400 light:text-text-light-secondary">Loading chart...</span>
        </div>
      </div>
    );
  }

  if (isCandleError || !rawCandles || rawCandles.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-sm dark:text-gray-500 light:text-text-light-secondary">No chart data available</span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full relative overflow-hidden" style={{ height }} />;
}
