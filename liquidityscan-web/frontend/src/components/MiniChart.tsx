import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';

interface MiniChartProps {
  candles: Array<{
    openTime: Date | string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  isLong: boolean;
  height?: number;
}

export function MiniChart({ candles, isLong, height = 100 }: MiniChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (error) {
        // Ignore cleanup errors
      }
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      return;
    }

    try {
      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#ffffff',
          fontSize: 10,
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        width: container.clientWidth,
        height: height,
        timeScale: {
          visible: false,
        },
        rightPriceScale: {
          visible: false,
        },
        crosshair: {
          mode: 0, // Hidden
        },
      });

      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#13ec37',
        downColor: '#ff4444',
        borderVisible: false,
        wickUpColor: '#13ec37',
        wickDownColor: '#ff4444',
      });

      // Prepare chart data (use last 20-30 candles for mini chart)
      const chartData = candles
        .slice(-30)
        .map((candle) => {
          const openTime = typeof candle.openTime === 'string' ? new Date(candle.openTime) : candle.openTime;
          return {
            time: Math.floor(openTime.getTime() / 1000) as any,
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
          };
        })
        .filter((c) => c.time && !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close));

      if (chartData.length > 0) {
        candlestickSeries.setData(chartData);
        chart.timeScale().fitContent();
      }

      chartRef.current = chart;

      return () => {
        if (chartRef.current) {
          try {
            chartRef.current.remove();
          } catch (error) {
            // Ignore cleanup errors
          }
          chartRef.current = null;
        }
      };
    } catch (error) {
      console.error('Error creating mini chart:', error);
    }
  }, [candles, isLong, height]);

  return (
    <div 
      ref={chartContainerRef} 
      className="w-full h-full"
      style={{ height: `${height}px`, minHeight: `${height}px` }}
    />
  );
}
