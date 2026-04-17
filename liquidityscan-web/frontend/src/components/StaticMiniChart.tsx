import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';

interface StaticMiniChartProps {
  candles: Array<{
    openTime: Date | string;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  isLong: boolean;
  height?: number;
}

export function StaticMiniChart({ candles, isLong, height = 128 }: StaticMiniChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  if (!candles || candles.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className={`material-symbols-outlined text-2xl ${isDark ? 'dark:text-gray-600 light:text-slate-400' : 'text-green-300'}`}>show_chart</span>
      </div>
    );
  }

  // Use last 20-30 candles for visualization
  const displayCandles = candles.slice(-30);
  
  // Calculate min and max prices for scaling
  const allPrices = displayCandles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;

  // Chart dimensions
  const chartHeight = height - 8; // Padding
  const padding = 4;
  const candleWidth = Math.max(3, 4); // Wider candles for better visibility
  const candleSpacing = candleWidth + 1.5;
  const chartWidth = padding * 2 + displayCandles.length * candleSpacing;

  // Color scheme - bullish always green, bearish always red
  const upColor = '#13ec37';
  const downColor = '#ff4444';
  const bgColor = isDark ? 'transparent' : '#ffffff';

  // Generate SVG path for candlesticks
  const candleElements = displayCandles.map((candle, index) => {
    const x = padding + index * candleSpacing + candleWidth / 2;
    
    // Scale prices to chart height
    const highY = padding + ((maxPrice - candle.high) / priceRange) * (chartHeight - padding * 2);
    const lowY = padding + ((maxPrice - candle.low) / priceRange) * (chartHeight - padding * 2);
    const openY = padding + ((maxPrice - candle.open) / priceRange) * (chartHeight - padding * 2);
    const closeY = padding + ((maxPrice - candle.close) / priceRange) * (chartHeight - padding * 2);
    
    const isUp = candle.close >= candle.open;
    const bodyTop = Math.min(openY, closeY);
    const bodyBottom = Math.max(openY, closeY);
    const bodyHeight = Math.max(1, bodyBottom - bodyTop);
    
    const color = isUp ? upColor : downColor;

    return (
      <g key={index}>
        {/* Wick */}
        <line
          x1={x}
          y1={highY}
          x2={x}
          y2={lowY}
          stroke={color}
          strokeWidth="1"
          opacity="0.8"
        />
        {/* Body */}
        <rect
          x={x - candleWidth / 2}
          y={bodyTop}
          width={candleWidth}
          height={bodyHeight}
          fill={color}
          opacity="0.9"
        />
      </g>
    );
  });

  const [hovered, setHovered] = useState(false);

  return (
    <div 
      className="w-full h-full flex items-center justify-center relative group/minichart" 
      style={{ height: `${height}px`, backgroundColor: bgColor }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        {candleElements}
      </svg>
      <AnimatePresence>
        {hovered && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute top-2 right-2 dark:bg-black/80 light:bg-white/90 text-xs font-mono font-bold px-2 py-1 rounded backdrop-blur-sm border dark:border-white/10 light:border-green-300 z-20 pointer-events-none drop-shadow-md flex items-center gap-1.5"
          >
            <span className={`w-2 h-2 rounded-full ${isLong ? 'bg-[#13ec37]' : 'bg-[#ff4444]'} animate-pulse`}></span>
            <span className="dark:text-gray-300 light:text-slate-600">Last {displayCandles.length} Candles</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
