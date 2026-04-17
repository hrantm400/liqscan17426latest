import React, { useMemo, useCallback } from 'react';
import { Candle, PatternResult } from '../types';

interface CandleVisualizerProps {
  candles: Candle[];
  patterns: (PatternResult | null)[];
  width?: number;
  height?: number;
  hideLabels?: boolean;
  /** Matches app theme — grid + labels read clearly in light mode */
  colorMode?: 'dark' | 'light';
}

export const CandleVisualizer: React.FC<CandleVisualizerProps> = ({ 
  candles, 
  patterns, 
  width = 800, 
  height = 400,
  hideLabels = false,
  colorMode = 'dark',
}) => {
  const isLight = colorMode === 'light';
  const gridStroke = isLight ? '#cbd5e1' : '#334155';
  const gridText = isLight ? '#64748b' : '#94a3b8';
  const badgeFill = isLight ? '#ffffff' : '#0f172a';
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Calculate Scale
  const { minPrice, maxPrice } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    if (candles.length === 0) return { minPrice: 0, maxPrice: 100 };
    candles.forEach(c => {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    });
    const range = max - min || 1;
    return { minPrice: min - range * 0.15, maxPrice: max + range * 0.15 };
  }, [candles]);

  const priceRange = maxPrice - minPrice;
  const candleWidth = Math.max((chartWidth / (candles.length || 1)) * 0.6, 2);
  const spacing = (chartWidth / (candles.length || 1));

  const getY = useCallback((price: number) => {
    return chartHeight - ((price - minPrice) / priceRange) * chartHeight + padding;
  }, [chartHeight, minPrice, priceRange, padding]);

  const getX = (index: number) => {
    return padding + index * spacing + spacing / 2;
  };

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
        const val = minPrice + (priceRange * (i/steps));
        lines.push({ val, y: getY(val) });
    }
    return lines;
  }, [minPrice, priceRange, getY]);

  if (candles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm font-medium px-6 text-center text-slate-500">
        Load or generate candles to preview the chart.
      </div>
    );
  }

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible select-none">
      <defs>
         <linearGradient id="bullGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#22c55e" />
         </linearGradient>
         <linearGradient id="bearGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#ef4444" />
         </linearGradient>
         
         <filter id="glow-bull" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
         </filter>
         <filter id="glow-bear" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
         </filter>
      </defs>

      {/* Modern Grid */}
      {gridLines.map((line, i) => (
         <g key={i}>
            <line x1={padding} y1={line.y} x2={width - padding} y2={line.y} stroke={gridStroke} strokeWidth="1" strokeDasharray="4 4" opacity={isLight ? 0.55 : 0.35} />
            <text x={width - padding + 10} y={line.y + 4} fill={gridText} fontSize="10" fontFamily="JetBrains Mono">{line.val.toFixed(2)}</text>
         </g>
      ))}

      {candles.map((c, i) => {
        const isBull = c.close > c.open;
        const colorUrl = isBull ? 'url(#bullGradient)' : 'url(#bearGradient)';
        const strokeColor = isBull ? '#4ade80' : '#f87171';
        const x = getX(i);
        const yOpen = getY(c.open);
        const yClose = getY(c.close);
        const yHigh = getY(c.high);
        const yLow = getY(c.low);
        
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);
        
        const pattern = patterns[i];

        return (
          <g key={c.id} className="transition-all duration-300">
             {/* Pattern Background Highlight (Always show background color even in quiz) */}
             {pattern && !hideLabels && (
                <rect 
                    x={x - spacing/2 + 2} 
                    y={padding} 
                    width={spacing - 4} 
                    height={chartHeight} 
                    fill={pattern.color} 
                    opacity={0.08}
                    className="animate-pulse"
                />
             )}

            {/* Wick */}
            <line 
                x1={x} y1={yHigh} 
                x2={x} y2={yLow} 
                stroke={strokeColor} 
                strokeWidth="1.5" 
                opacity={0.8}
            />
            
            {/* Body */}
            <rect
              x={x - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight} 
              fill={colorUrl}
              rx={2}
              filter={isBull ? 'url(#glow-bull)' : 'url(#glow-bear)'}
              opacity={0.9}
            />

            {/* Pattern Label & Marker (Hidden in Quiz Mode) */}
            {pattern && !hideLabels && (
                <g transform={`translate(${x}, ${isBull ? yLow + 25 : yHigh - 25})`}>
                     {/* Connector Line */}
                    <line x1="0" y1={isBull ? -5 : 5} x2="0" y2={isBull ? -20 : 20} stroke={pattern.color} strokeWidth="1" opacity={0.5} />
                    
                    {/* Badge */}
                    <rect 
                        x="-24" y={isBull ? -10 : -10} 
                        width="48" height="20" 
                        rx="4" 
                        fill={badgeFill} 
                        stroke={pattern.color} 
                        strokeWidth="1"
                    />
                    <text 
                        y={4} 
                        textAnchor="middle" 
                        fill={pattern.color} 
                        fontWeight="bold"
                        fontSize="10"
                        fontFamily="JetBrains Mono"
                        className="tracking-tighter"
                    >
                        {pattern.label.replace('Bull', '').replace('Bear', '').trim()}
                    </text>
                </g>
            )}

            {/* X Logic Arc Lines (Conceptual) - Hide in quiz too as it gives it away */}
            {pattern?.xCount && pattern.xCount > 0 && !hideLabels && (
                <path 
                    d={`M ${x} ${isBull ? yLow : yHigh} Q ${x - (spacing * pattern.xCount)/2} ${isBull ? yLow + 50 : yHigh - 50} ${getX(i - pattern.xCount)} ${isBull ? candles[i-pattern.xCount].low : candles[i-pattern.xCount].high}`}
                    fill="none"
                    stroke={pattern.color}
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                    strokeOpacity={0.6}
                />
            )}
          </g>
        );
      })}
    </svg>
  );
};
