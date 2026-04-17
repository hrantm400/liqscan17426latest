import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useFloatingChartStore, FloatingChartData } from '../../store/floatingChartStore';
import { buildMonitorSearchParams, getMonitorLocationForStrategy } from '../../utils/floatingChartRoutes';
import { InteractiveLiveChartGate } from '../InteractiveLiveChartGate';
import { fetchCandles } from '../../services/candles';
import { fetchSignalById, fetchSignals } from '../../services/signalsApi';
import { isCisdFamilySignal } from '../../utils/drawCisdOverlays';
import { TradingViewWidget } from '../TradingViewWidget';
import { useTheme } from '../../contexts/ThemeContext';
import type { Signal, StrategyType, Timeframe } from '../../types';

/** Match SignalDetails / InteractiveLiveChart lookback so pivots and RSI div match the main chart */
const FLOATING_CHART_CANDLE_LIMIT = 300;

// Helper to format timeframe for TradingView
const getTradingViewTimeframe = (tf: string): string => {
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
};

interface FloatingChartProps {
    chartData: FloatingChartData;
}

const formatStrategySource = (s: string) => {
    const map: Record<string, string> = {
        SUPER_ENGULFING: 'SuperEngulfing',
        ICT_BIAS: 'ICT Bias',
        RSIDIVERGENCE: 'RSI Div',
        CRT: 'CRT',
        '3OB': '3-OB',
        CISD: 'CISD',
    };
    return map[s] || s;
};

export const FloatingChart: React.FC<FloatingChartProps> = ({ chartData }) => {
    const navigate = useNavigate();
    const { removeChart, toggleMinimizeChart, updateChartPosition, updateChartSize, updateChartType } = useFloatingChartStore();
    const dragControls = useDragControls();

    const monitorLocation = useMemo(
        () => getMonitorLocationForStrategy(chartData.strategyType),
        [chartData.strategyType],
    );

    const canOpenSomewhere = Boolean(chartData.signalId || monitorLocation);

    const openSignalOrMonitor = useCallback(() => {
        if (chartData.signalId) {
            navigate(`/signals/${encodeURIComponent(chartData.signalId)}`);
            return;
        }
        if (!monitorLocation) return;
        const qs = buildMonitorSearchParams(chartData.strategyType, chartData.symbol, chartData.timeframe);
        navigate({ pathname: monitorLocation.pathname, search: qs ? `?${qs}` : '' });
    }, [chartData.signalId, chartData.strategyType, chartData.symbol, chartData.timeframe, monitorLocation, navigate]);
    const containerRef = useRef<HTMLDivElement>(null);
    const [chartHeight, setChartHeight] = useState(chartData.h ? chartData.h - 40 : 264);
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const { data: historicalCandles, isLoading: candlesLoading } = useQuery({
        queryKey: ['candles', chartData.symbol, chartData.timeframe, 'floating', FLOATING_CHART_CANDLE_LIMIT],
        queryFn: async () => fetchCandles(chartData.symbol, chartData.timeframe, FLOATING_CHART_CANDLE_LIMIT),
        enabled: !!chartData.symbol && !!chartData.timeframe && !chartData.isTradingView,
        refetchInterval: 60000,
        staleTime: 60000,
    });

    const {
        data: fetchedSignal,
        isLoading: signalLoading,
        isFetched: signalFetched,
    } = useQuery({
        queryKey: ['floating-chart-signal', chartData.signalId],
        queryFn: () => fetchSignalById(chartData.signalId!),
        enabled: !!chartData.signalId && !chartData.isTradingView,
        staleTime: 30_000,
    });

    // Header price from last candle; candle momentum only when we have no API signal yet
    const { currentPrice, candleMomentumLong } = useMemo(() => {
        const list = historicalCandles;
        if (!list?.length) return { currentPrice: undefined as number | undefined, candleMomentumLong: true };
        const last = list[list.length - 1];
        const price = Number(last.close);
        if (!Number.isFinite(price)) return { currentPrice: undefined, candleMomentumLong: true };
        const prev = list.length > 1 ? list[list.length - 2] : null;
        let long = true;
        if (prev) {
            const pc = Number(prev.close);
            long = Number.isFinite(pc) && price >= pc;
        } else {
            const op = Number(last.open);
            long = Number.isFinite(op) && price >= op;
        }
        return { currentPrice: price, candleMomentumLong: long };
    }, [historicalCandles]);

    /** Real signal when mini-player was opened from a row / signal page — required for RSI div, SE, etc. */
    const chartSignal: Signal | null = useMemo(() => {
        if (chartData.signalId) {
            return fetchedSignal ?? null;
        }
        return {
            id: `${chartData.strategyType}-${chartData.symbol}-${chartData.timeframe}`,
            symbol: chartData.symbol,
            timeframe: chartData.timeframe as Timeframe,
            strategyType: chartData.strategyType as StrategyType,
            signalType: candleMomentumLong ? 'BUY' : 'SELL',
            detectedAt: new Date().toISOString(),
            price: currentPrice ?? 0,
            lifecycleStatus: 'PENDING',
            status: 'PENDING',
        };
    }, [chartData.signalId, chartData.strategyType, chartData.symbol, chartData.timeframe, fetchedSignal, candleMomentumLong, currentPrice]);

    const isCisdFloating = Boolean(chartSignal && isCisdFamilySignal(chartSignal));

    const { data: cisdRelatedFloating = [] } = useQuery({
        queryKey: ['signals', 'CISD', 5000, 'floatingRelated'],
        queryFn: () => fetchSignals('CISD', 5000),
        enabled:
            !chartData.isTradingView &&
            !!chartData.signalId &&
            isCisdFloating &&
            !!chartData.symbol &&
            !!chartData.timeframe,
        staleTime: 60_000,
    });

    const cisdRelatedForFloating = useMemo(() => {
        if (!isCisdFloating || !chartData.symbol || !chartData.timeframe) return undefined;
        return cisdRelatedFloating.filter(
            (s) => s.symbol === chartData.symbol && s.timeframe === chartData.timeframe,
        );
    }, [isCisdFloating, cisdRelatedFloating, chartData.symbol, chartData.timeframe]);

    const directionIsLong =
        chartSignal != null ? chartSignal.signalType === 'BUY' : candleMomentumLong;

    const isLong = directionIsLong;

    const signalLoadError = !!chartData.signalId && signalFetched && !signalLoading && fetchedSignal == null;
    const chartBlocking =
        !chartData.isTradingView && (candlesLoading || (!!chartData.signalId && signalLoading));

    // Use ResizeObserver to detect manual CSS resizing and keep chart height in sync.
    // Avoid dispatching global window resize events (they cause other floating charts to reflow).
    useEffect(() => {
        if (!containerRef.current || chartData.isMinimized) return;
        
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newHeight = entry.contentRect.height;
                setChartHeight(newHeight);
            }
        });
        
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [chartData.isMinimized]);

    // Glow effect classes based on signal type
    const glowClass = isLong 
        ? "shadow-[0_0_30px_rgba(19,236,55,0.15)] border-primary/30" 
        : "shadow-[0_0_30px_rgba(239,68,68,0.15)] border-red-500/30";

    const miniGlowClass = isLong
        ? "from-[#13ec37]/20 to-[#13ec37]/5 border-[#13ec37]/30 shadow-[0_0_20px_rgba(19,236,55,0.2)] hover:shadow-[0_0_30px_rgba(19,236,55,0.4)]"
        : "from-red-500/20 to-red-500/5 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)]";

    // Render Minimized Circle Form
    if (chartData.isMinimized) {
        return (
            <motion.div
                drag
                dragMomentum={false}
                dragElastic={0.1}
                initial={{ 
                    opacity: 0, 
                    scale: 0.5, 
                    x: chartData.x ?? window.innerWidth - 100, 
                    y: chartData.y ?? window.innerHeight - 100 
                }}
                animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    x: chartData.x ?? window.innerWidth - 100, 
                    y: chartData.y ?? window.innerHeight - 100,
                    width: 56,
                    height: 56
                }}
                onDragEnd={(_, info) => {
                    updateChartPosition(chartData.id, chartData.x! + info.offset.x, chartData.y! + info.offset.y);
                }}
                exit={{ opacity: 0, scale: 0.5 }}
                className={`absolute z-[100] pointer-events-auto cursor-grab active:cursor-grabbing group flex items-center justify-center rounded-full bg-gradient-to-br border-2 transition-all backdrop-blur-xl ${miniGlowClass}`}
                style={{ width: 56, height: 56 }}
                onClick={() => toggleMinimizeChart(chartData.id)}
            >
                <div className="flex flex-col items-center pointer-events-none">
                    <span className="dark:text-white light:text-slate-900 text-[10px] font-black drop-shadow-md">
                        {chartData.symbol.replace('USDT', '')}
                    </span>
                    {currentPrice && (
                        <span className="text-[8px] dark:text-gray-300 light:text-slate-600 font-mono leading-none">
                            ${currentPrice > 1 ? Number(currentPrice).toFixed(2) : currentPrice}
                        </span>
                    )}
                </div>

                {canOpenSomewhere && (
                    <button
                        type="button"
                        title={chartData.signalId ? 'Open signal page' : 'Open monitor list'}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            openSignalOrMonitor();
                        }}
                        className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-primary text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-[101] pointer-events-auto"
                    >
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </button>
                )}
                
                {/* Close Button on Hover */}
                <button 
                    onClick={(e) => { e.stopPropagation(); removeChart(chartData.id); }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-[101] pointer-events-auto"
                >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
            </motion.div>
        );
    }

    // Full Chart Window
    return (
        <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0.1}
            initial={{ 
                opacity: 0, 
                scale: 0.9, 
                x: chartData.x ?? 100, 
                y: chartData.y ?? 100 
            }}
            animate={{ 
                opacity: 1, 
                scale: 1, 
                x: chartData.x ?? 100, 
                y: chartData.y ?? 100,
                width: chartData.w ?? 420,
                height: chartData.h ?? 340
            }}
            onDragEnd={(_, info) => {
                updateChartPosition(chartData.id, chartData.x! + info.offset.x, chartData.y! + info.offset.y);
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`absolute z-[90] border rounded-xl flex flex-col shadow-2xl pointer-events-auto transition-shadow duration-500 ${glowClass}
              dark:bg-[#0c1010] dark:border-white/10
              light:bg-white light:border-slate-200`}
            style={{ 
                minWidth: '300px', 
                minHeight: '200px',
                resize: 'both', 
                overflow: 'hidden' 
            }}
            onMouseUp={() => {
                if (containerRef.current) {
                    const { offsetWidth, offsetHeight } = containerRef.current.parentElement as HTMLElement;
                    if (offsetWidth !== chartData.w || offsetHeight !== chartData.h) {
                        updateChartSize(chartData.id, offsetWidth, offsetHeight);
                    }
                }
            }}
        >
            {/* Header (Drag Handle) */}
            <div 
                onPointerDown={(e) => dragControls.start(e, { snapToCursor: false })}
                className="h-10 flex items-center justify-between px-3 cursor-move transition-colors shrink-0 select-none touch-none
                  dark:bg-white/5 dark:border-b dark:border-white/10 dark:hover:bg-white/10
                  light:bg-slate-50 light:border-b light:border-slate-200 light:hover:bg-slate-100"
            >
                <div className="flex items-center gap-2 pointer-events-none">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black tracking-wider dark:text-white light:text-slate-900">
                                {chartData.symbol.replace('USDT', '')}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border
                              dark:text-gray-400 dark:bg-black/30 dark:border-white/5
                              light:text-slate-600 light:bg-white light:border-slate-200">
                                {chartData.timeframe}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border
                              dark:text-gray-400 dark:bg-white/5 dark:border-white/10
                              light:text-slate-600 light:bg-white light:border-slate-200">
                                {formatStrategySource(chartData.strategyType)}
                            </span>
                        </div>
                        {currentPrice && (
                            <span className={`text-[10px] font-mono font-bold leading-none ${isLong ? 'text-primary' : 'text-red-400'}`}>
                                ${currentPrice > 1 ? Number(currentPrice).toLocaleString() : currentPrice}
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-1 z-50 pointer-events-auto">
                    {canOpenSomewhere && (
                        <button
                            type="button"
                            title={chartData.signalId ? 'Open signal page' : 'Open monitor list'}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                openSignalOrMonitor();
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer
                              dark:hover:bg-primary/20 dark:text-primary dark:hover:text-primary
                              light:hover:bg-green-100 light:text-slate-600 light:hover:text-emerald-700"
                        >
                            <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                    )}
                    {/* Toggle Native / TV */}
                    <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => updateChartType(chartData.id, !chartData.isTradingView)}
                        className={`px-2 py-1 text-[9px] uppercase font-bold tracking-wider rounded transition-colors border
                          ${chartData.isTradingView
                            ? 'dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20 dark:border-white/10 light:bg-slate-50 light:text-slate-700 light:hover:bg-slate-100 light:border-slate-200'
                            : 'bg-primary/20 text-primary hover:bg-primary/30 border-primary/30'
                          }`}
                    >
                        {chartData.isTradingView ? 'Native' : 'TradingView'}
                    </button>
                    
                    <div className="w-px h-4 mx-1 dark:bg-white/10 light:bg-slate-200"></div>

                    {/* Minimize Button */}
                    <button 
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => toggleMinimizeChart(chartData.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer
                          dark:hover:bg-white/10 dark:text-gray-400 dark:hover:text-white
                          light:hover:bg-slate-200 light:text-slate-600 light:hover:text-slate-900"
                        title="Minimize"
                    >
                        <span className="material-symbols-outlined text-[16px]">remove</span>
                    </button>

                    {/* Close Button */}
                    <button 
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => removeChart(chartData.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer
                          dark:hover:bg-red-500/20 dark:text-gray-400 dark:hover:text-red-400
                          light:hover:bg-red-50 light:text-slate-600 light:hover:text-red-600"
                        title="Close"
                    >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                </div>
            </div>

            {/* Chart Content Area */}
            <div
                ref={containerRef}
                className="flex-1 w-full relative overflow-hidden group/chart pointer-events-auto
                  dark:bg-[#0c1010]
                  light:bg-white"
            >
                {chartData.isTradingView ? (
                    <TradingViewWidget
                        symbol={chartData.symbol}
                        interval={getTradingViewTimeframe(chartData.timeframe)}
                        theme={isDark ? 'dark' : 'light'}
                        height="100%"
                    />
                ) : signalLoadError ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-mono px-4 text-center dark:text-amber-400/90 light:text-amber-700 bg-grid-pattern bg-[length:16px_16px] opacity-90 backdrop-blur-sm">
                        Could not load this signal. Close the mini-player and open it again from the list.
                    </div>
                ) : chartBlocking || !chartSignal ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-mono bg-grid-pattern bg-[length:16px_16px] opacity-80 backdrop-blur-sm dark:text-gray-500 light:text-slate-500">
                        <div className="flex flex-col items-center gap-2 animate-pulse">
                            <span className="material-symbols-outlined text-primary/50 text-3xl">refresh</span>
                            <span>
                                {chartData.signalId && signalLoading ? 'Loading signal…' : 'Loading candles…'}
                            </span>
                        </div>
                    </div>
                ) : (
                    <InteractiveLiveChartGate
                        candles={historicalCandles || []}
                        symbol={chartData.symbol}
                        timeframe={chartData.timeframe}
                        signal={chartSignal as any}
                        relatedSignals={cisdRelatedForFloating}
                        height={chartHeight}
                        isFloating={true}
                    />
                )}
               
               {/* Invisible overlay while dragging to prevent iframe from intercepting mouse events */}
               <div className="absolute inset-0 z-10 opacity-0 pointer-events-none group-active/chart:pointer-events-auto" />
            </div>
            
            {/* Custom visual resize handle helper (CSS resize provides the actual functionality) */}
            <div className="absolute bottom-0 right-0 w-5 h-5 pointer-events-none flex items-center justify-center transition-opacity opacity-20 group-hover:opacity-100">
                <span className="material-symbols-outlined text-[14px] text-white -rotate-45 translate-x-1 translate-y-1">unfold_more</span>
            </div>
        </motion.div>
    );
};
