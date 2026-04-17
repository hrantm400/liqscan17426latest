import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, Time, TickMarkType } from 'lightweight-charts';
import { Candle, Signal } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { formatChartTimeForUser } from '../utils/userTimeFormat';

interface ChartProps {
  candles: Candle[];
  signals?: Signal[];
  symbol: string;
  timeframe: string;
  height?: number;
}

export function Chart({ candles, signals, symbol, timeframe, height = 400 }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const { theme } = useTheme();
  const userTimezone = useAuthStore((s) => s.user?.timezone);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const isDark = theme === 'dark';
    const tz = useAuthStore.getState().user?.timezone ?? undefined;
    const chartLocalization = {
      locale: 'en-GB' as const,
      dateFormat: "dd MMM 'yy" as const,
      timeFormatter: (t: Time) => formatChartTimeForUser(t, tz),
    };
    const tickMarkFormatter = (time: Time, _tickMarkType: TickMarkType) =>
      formatChartTimeForUser(time, tz);

    const chart = createChart(chartContainerRef.current, {
      localization: chartLocalization,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0b140d' : '#ffffff' },
        textColor: isDark ? '#ffffff' : '#000000',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' },
        horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: isMobile ? 300 : height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        tickMarkFormatter,
      },
      rightPriceScale: {
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#13ec37',
      downColor: '#ff4444',
      borderVisible: false,
      wickUpColor: '#13ec37',
      wickDownColor: '#ff4444',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: isMobile ? 300 : height,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [theme, height, isMobile, userTimezone]);

  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;

    const chartData = candles.map((candle) => ({
      time: Math.floor(new Date(candle.openTime).getTime() / 1000) as Time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    }));

    seriesRef.current.setData(chartData);

    // Add signal markers
    if (signals && signals.length > 0 && chartRef.current) {
      const markers = signals.map((signal) => ({
        time: Math.floor(new Date(signal.detectedAt).getTime() / 1000) as Time,
        position: signal.signalType === 'BUY' ? ('belowBar' as const) : ('aboveBar' as const),
        color: signal.signalType === 'BUY' ? '#13ec37' : '#ff4444',
        shape: signal.signalType === 'BUY' ? ('arrowUp' as const) : ('arrowDown' as const),
        text: signal.signalType,
      }));

      seriesRef.current.setMarkers(markers);
    }
  }, [candles, signals]);

  return (
    <div className="w-full glass-panel rounded-xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white dark:text-white">{symbol}</h3>
          <p className="text-sm dark:text-gray-400 light:text-slate-500">{timeframe}</p>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" style={{ height: isMobile ? 300 : height }} />
    </div>
  );
}
