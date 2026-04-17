import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSignals, fetchRsiDivergenceSignalsUnion } from '../services/signalsApi';
import { staggerContainer, listItemVariants } from '../utils/animations';
import { useVolumeData } from '../hooks/useVolumeData';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Timeframe } from '../types';
import { AnimatedNumber } from '../components/animations/AnimatedNumber';
import { NotificationBell } from '../components/shared/NotificationBell';

interface StrategySummary {
  total: number;
  timeframes: Record<Timeframe, number>;
}

// Strategy-specific timeframes (as per Java bot and PineScript indicators)
const STRATEGY_TIMEFRAMES = {
  SUPER_ENGULFING: ['4h', '1d', '1w'] as Timeframe[],
  RSI_DIVERGENCE: ['1h', '4h', '1d'] as Timeframe[],
  ICT_BIAS: ['4h', '1d', '1w'] as Timeframe[],
  CRT: ['1h', '4h', '1d', '1w'] as Timeframe[],
  '3OB': ['4h', '1d', '1w'] as Timeframe[],
  CISD: ['4h', '1d', '1w'] as Timeframe[],
};

export const Dashboard: React.FC = () => {
  const { volumeMap } = useVolumeData();
  const [expandedAccordions, setExpandedAccordions] = useState<Set<string>>(new Set());
  // Initialize with only relevant timeframes for each strategy
  // Utilizing run-time memoization for performance instead of state sync

  // Super Engulfing: from GET /api/signals (webhook-fed); Bias/RSI: no source yet
  const { data: seData } = useQuery({
    queryKey: ['signals', 'SUPER_ENGULFING', 500, 20000000],
    queryFn: () => fetchSignals('SUPER_ENGULFING', 500, 20_000_000),
    refetchInterval: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: biasData } = useQuery({
    queryKey: ['signals', 'ICT_BIAS', 500, 20000000],
    queryFn: () => fetchSignals('ICT_BIAS', 500, 20_000_000),
    refetchInterval: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: rsiData } = useQuery({
    queryKey: ['signals', 'RSI_DIVERGENCE_UNION', 500, 20000000],
    queryFn: () => fetchRsiDivergenceSignalsUnion(500, 20_000_000),
    refetchInterval: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: crtData } = useQuery({
    queryKey: ['signals', 'CRT', 500, 20000000],
    queryFn: () => fetchSignals('CRT', 500, 20_000_000),
    refetchInterval: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: threeObData } = useQuery({
    queryKey: ['signals', '3OB', 500, 20000000],
    queryFn: () => fetchSignals('3OB', 500, 20_000_000),
    refetchInterval: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: cisdData } = useQuery({
    queryKey: ['signals', 'CISD', 500, 20000000],
    queryFn: () => fetchSignals('CISD', 500, 20_000_000),
    refetchInterval: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });


  const superEngulfingSummary = useMemo(() => {
    const summary: StrategySummary = {
      total: 0,
      timeframes: { '4h': 0, '1d': 0, '1w': 0 } as Record<Timeframe, number>,
    };
    if (!seData) return summary;
    const allSignals = seData as any[];
    const volFiltered = volumeMap && volumeMap.size > 0
      ? allSignals.filter(s => (volumeMap.get(s.symbol) || 0) >= 20_000_000)
      : allSignals;
    // Only count PENDING/ACTIVE as "active" signals
    const signals = volFiltered.filter(s => s.lifecycleStatus === 'PENDING' || s.lifecycleStatus === 'ACTIVE' || s.state === 'live');
    summary.total = signals.length;
    signals.forEach((signal) => {
      const tf = signal.timeframe as Timeframe;
      if (STRATEGY_TIMEFRAMES.SUPER_ENGULFING.includes(tf) && summary.timeframes[tf] !== undefined) summary.timeframes[tf]++;
    });
    return summary;
  }, [seData, volumeMap]);

  const biasSummary = useMemo(() => {
    const summary: StrategySummary = {
      total: 0,
      timeframes: { '4h': 0, '1d': 0, '1w': 0 } as Record<Timeframe, number>,
    };
    if (!biasData) return summary;
    const allSignals = biasData as any[];
    const volFiltered = volumeMap && volumeMap.size > 0
      ? allSignals.filter(s => (volumeMap.get(s.symbol) || 0) >= 20_000_000)
      : allSignals;
    const signals = volFiltered.filter(s => s.lifecycleStatus === 'PENDING' || s.lifecycleStatus === 'ACTIVE');
    summary.total = signals.length;
    signals.forEach((signal) => {
      const tf = signal.timeframe as Timeframe;
      if (STRATEGY_TIMEFRAMES.ICT_BIAS.includes(tf) && summary.timeframes[tf] !== undefined) summary.timeframes[tf]++;
    });
    return summary;
  }, [biasData, volumeMap]);

  const rsiSummary = useMemo(() => {
    const summary: StrategySummary = {
      total: 0,
      timeframes: { '1h': 0, '4h': 0, '1d': 0 } as Record<Timeframe, number>,
    };
    if (!rsiData) return summary;
    const allSignals = rsiData as any[];
    const volFiltered = volumeMap && volumeMap.size > 0
      ? allSignals.filter(s => (volumeMap.get(s.symbol) || 0) >= 20_000_000)
      : allSignals;
    const signals = volFiltered.filter(s => s.lifecycleStatus === 'PENDING' || s.lifecycleStatus === 'ACTIVE');
    summary.total = signals.length;
    signals.forEach((signal) => {
      const tf = signal.timeframe as Timeframe;
      if (STRATEGY_TIMEFRAMES.RSI_DIVERGENCE.includes(tf) && summary.timeframes[tf] !== undefined) summary.timeframes[tf]++;
    });
    return summary;
  }, [rsiData, volumeMap]);

  const crtSummary = useMemo(() => {
    const summary: StrategySummary = {
      total: 0,
      timeframes: { '1h': 0, '4h': 0, '1d': 0, '1w': 0 } as Record<Timeframe, number>,
    };
    if (!crtData) return summary;
    const allSignals = crtData as any[];
    const volFiltered = volumeMap && volumeMap.size > 0
      ? allSignals.filter(s => (volumeMap.get(s.symbol) || 0) >= 20_000_000)
      : allSignals;
    const signals = volFiltered.filter(s => s.lifecycleStatus === 'PENDING' || s.lifecycleStatus === 'ACTIVE');
    summary.total = signals.length;
    signals.forEach((signal) => {
      const tf = signal.timeframe as Timeframe;
      if (STRATEGY_TIMEFRAMES.CRT.includes(tf) && summary.timeframes[tf] !== undefined) summary.timeframes[tf]++;
    });
    return summary;
  }, [crtData, volumeMap]);

  const threeObSummary = useMemo(() => {
    const summary: StrategySummary = {
      total: 0,
      timeframes: { '4h': 0, '1d': 0, '1w': 0 } as Record<Timeframe, number>,
    };
    if (!threeObData) return summary;
    const allSignals = threeObData as any[];
    const volFiltered = volumeMap && volumeMap.size > 0
      ? allSignals.filter(s => (volumeMap.get(s.symbol) || 0) >= 20_000_000)
      : allSignals;
    const signals = volFiltered.filter(s => s.lifecycleStatus === 'PENDING' || s.lifecycleStatus === 'ACTIVE');
    summary.total = signals.length;
    signals.forEach((signal) => {
      const tf = signal.timeframe as Timeframe;
      if (STRATEGY_TIMEFRAMES['3OB'].includes(tf) && summary.timeframes[tf] !== undefined) summary.timeframes[tf]++;
    });
    return summary;
  }, [threeObData, volumeMap]);

  const cisdSummary = useMemo(() => {
    const summary: StrategySummary = {
      total: 0,
      timeframes: { '4h': 0, '1d': 0, '1w': 0 } as Record<Timeframe, number>,
    };
    const merged = (cisdData as any[]) || [];
    if (merged.length === 0) return summary;
    const volFiltered =
      volumeMap && volumeMap.size > 0
        ? merged.filter((s) => (volumeMap.get(s.symbol) || 0) >= 20_000_000)
        : merged;
    const signals = volFiltered.filter(s => s.lifecycleStatus === 'PENDING' || s.lifecycleStatus === 'ACTIVE');
    summary.total = signals.length;
    signals.forEach((signal) => {
      const tf = signal.timeframe as Timeframe;
      if (STRATEGY_TIMEFRAMES.CISD.includes(tf) && summary.timeframes[tf] !== undefined) summary.timeframes[tf]++;
    });
    return summary;
  }, [cisdData, volumeMap]);

  const toggleAccordion = (targetId: string) => {
    setExpandedAccordions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(targetId)) {
        newSet.delete(targetId);
      } else {
        // Close all others
        newSet.clear();
        newSet.add(targetId);
      }
      return newSet;
    });
  };

  const isExpanded = (targetId: string) => expandedAccordions.has(targetId);

  return (
    <motion.div
      className="flex flex-col h-full"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Header */}
      <motion.header
        variants={listItemVariants}
        className="flex items-center justify-between px-4 py-4 md:px-8 md:py-6 shrink-0 z-20"
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium text-primary/80 uppercase tracking-widest">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-glow"></span>
            System Online
          </div>
          <h1 className="text-xl md:text-3xl font-black tracking-tighter dark:text-white light:text-text-dark flex items-center gap-3 drop-shadow-lg">
            Monitor Overview
          </h1>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <NotificationBell />
        </div>
      </motion.header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-2 md:p-8 md:pt-2">
        <div className="max-w-7xl mx-auto h-full flex flex-col pb-20">
          {/* Strategy Accordions */}
          <motion.div
            variants={staggerContainer}
            className="flex flex-col gap-4 relative isolate mb-16"
          >
            {/* SuperEngulfing */}
            <motion.div
              variants={listItemVariants}
              whileHover={{ scale: 1.005 }}
              className="glass-panel rounded-2xl relative z-30 overflow-hidden group/card"
            >
              <div
                className={`p-4 md:p-6 flex items-center justify-between cursor-pointer transition-all ${isExpanded('superEngulfing-content') ? 'accordion-header-expanded' : ''
                  }`}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) {
                    toggleAccordion('superEngulfing-content');
                  }
                }}
              >
                <Link to="/monitor/superengulfing" className="flex items-center gap-4 group">
                  <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-primary/5 border border-primary/20 flex items-center justify-center text-primary box-glow group-hover:bg-primary/10 transition-all duration-300">
                    <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">bolt</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-lg md:text-2xl font-bold dark:text-white light:text-text-dark group-hover:text-primary transition-colors tracking-tight">SuperEngulfing</h3>
                    <span className="text-xs dark:text-gray-400 light:text-text-light-secondary tracking-widest font-mono uppercase opacity-70">Strategy A-01 • Trend Following</span>
                  </div>
                </Link>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold border border-primary/20 animate-pulse shadow-glow">
                    <AnimatedNumber value={superEngulfingSummary.total} /> SIGNALS ACTIVE
                  </span>
                  <button
                    className="toggle-button w-8 h-8 flex items-center justify-center rounded-full dark:hover:bg-white/10 light:hover:bg-slate-200 transition-all"
                    title="Toggle View"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAccordion('superEngulfing-content');
                    }}
                  >
                    <span className={`material-symbols-outlined text-xl transition-transform duration-300 ${isExpanded('superEngulfing-content') ? 'rotate-180 text-primary' : 'dark:text-gray-500 light:text-slate-500'}`}>
                      expand_more
                    </span>
                  </button>
                </div>
              </div>
              <div
                className={`accordion-content ${isExpanded('superEngulfing-content') ? 'expanded' : ''}`}
                id="superEngulfing-content"
              >
                <div className="p-4 md:p-6 flex flex-col gap-3">
                  {['4h', '1d', '1w'].map((tf) => (
                    <Link
                      key={tf}
                      to={`/monitor/superengulfing?timeframe=${tf}`}
                      className="w-full flex justify-between items-center p-3 md:p-4 rounded-xl dark:border-white/5 light:border-green-300 dark:bg-white/[0.01] hover:bg-primary/5 hover:border-primary/20 transition-all cursor-pointer group/item relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      <div className="flex items-center gap-4 relative z-10">
                        <span className="w-12 h-8 flex items-center justify-center rounded-md text-sm font-black bg-primary/10 text-primary border border-primary/20 font-mono group-hover/item:bg-primary group-hover/item:text-black transition-colors">
                          {tf.toUpperCase()}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium dark:text-gray-300 light:text-slate-600 dark:group-hover/item:text-white light:group-hover/item:text-text-dark transition-colors">
                            {tf === '4h' ? 'Mid-Term Trend' : tf === '1d' ? 'Daily Structure' : 'Macro View'}
                          </span>
                          <span className="text-[10px] dark:text-gray-500 light:text-slate-500 font-mono">
                            {tf === '4h' ? 'Intraday swings' : tf === '1d' ? 'Major market moves' : 'Long-term bias'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                        <span className={`font-mono font-bold text-lg ${superEngulfingSummary.timeframes[tf as Timeframe] > 0 ? 'dark:text-white light:text-text-dark text-glow' : 'dark:text-gray-600 light:text-slate-400'}`}>
                          <AnimatedNumber value={superEngulfingSummary.timeframes[tf as Timeframe]} />
                        </span>
                        <span className="material-symbols-outlined text-sm dark:text-gray-600 mr-2 group-hover/item:translate-x-1 transition-transform text-primary">arrow_forward</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Daily Bias */}
            <motion.div
              variants={listItemVariants}
              whileHover={{ scale: 1.005 }}
              className="glass-panel rounded-2xl relative z-20 overflow-hidden group/card"
            >
              <div
                className={`p-4 md:p-6 flex items-center justify-between cursor-pointer transition-all ${isExpanded('dailyBias-content') ? 'accordion-header-expanded' : ''
                  }`}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) {
                    toggleAccordion('dailyBias-content');
                  }
                }}
              >
                <Link to="/monitor/bias" className="flex items-center gap-4 group">
                  <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)] group-hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] group-hover:bg-blue-500/20 transition-all duration-300">
                    <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">explore</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-lg md:text-2xl font-bold dark:text-white light:text-text-dark group-hover:text-blue-500 transition-colors tracking-tight">Daily Bias</h3>
                    <span className="text-xs dark:text-gray-400 light:text-text-light-secondary tracking-widest font-mono uppercase opacity-70">Strategy B-04 • Market Direction</span>
                  </div>
                </Link>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[11px] font-bold border border-blue-500/20 animate-pulse">
                    <AnimatedNumber value={biasSummary.total} /> ACTIVE
                  </span>
                  <button
                    className="toggle-button w-8 h-8 flex items-center justify-center rounded-full dark:hover:bg-white/10 light:hover:bg-slate-200 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAccordion('dailyBias-content');
                    }}
                  >
                    <span className={`material-symbols-outlined text-xl transition-transform duration-300 ${isExpanded('dailyBias-content') ? 'rotate-180 text-blue-500' : 'dark:text-gray-500 light:text-slate-500'}`}>expand_more</span>
                  </button>
                </div>
              </div>
              <div
                className={`accordion-content ${isExpanded('dailyBias-content') ? 'expanded' : ''}`}
                id="dailyBias-content"
              >
                <div className="p-4 md:p-6 flex flex-col gap-3">
                  {['4h', '1d', '1w'].map((tf) => (
                    <Link
                      key={tf}
                      to={`/monitor/bias?timeframe=${tf}`}
                      className="w-full flex justify-between items-center p-3 md:p-4 rounded-xl dark:border-white/5 light:border-green-300 dark:bg-white/[0.01] hover:bg-blue-500/5 hover:border-blue-500/20 transition-all cursor-pointer group/item relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      <div className="flex items-center gap-4 relative z-10">
                        <span className="w-12 h-8 flex items-center justify-center rounded-md text-sm font-black bg-blue-500/10 text-blue-500 border border-blue-500/20 font-mono group-hover/item:bg-blue-500 group-hover/item:text-white transition-colors">
                          {tf.toUpperCase()}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium dark:text-gray-300 light:text-slate-600 dark:group-hover/item:text-white light:group-hover/item:text-text-dark transition-colors">
                            {tf === '4h' ? 'Mid-Term Bias' : tf === '1d' ? 'Daily Bias' : 'Weekly Bias'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                        <span className={`font-mono font-bold text-lg ${biasSummary.timeframes[tf as Timeframe] > 0 ? 'dark:text-white light:text-text-dark' : 'dark:text-gray-600 light:text-slate-400'}`}>
                          <AnimatedNumber value={biasSummary.timeframes[tf as Timeframe]} />
                        </span>
                        <span className="material-symbols-outlined text-sm dark:text-gray-600 mr-2 group-hover/item:translate-x-1 transition-transform text-blue-500">arrow_forward</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* RSI Divergence */}
            <motion.div
              variants={listItemVariants}
              whileHover={{ scale: 1.005 }}
              className="glass-panel rounded-2xl relative z-10 overflow-hidden group/card"
            >
              <div
                className={`p-4 md:p-6 flex items-center justify-between cursor-pointer transition-all ${isExpanded('rsiDivergence-content') ? 'accordion-header-expanded' : ''
                  }`}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) {
                    toggleAccordion('rsiDivergence-content');
                  }
                }}
              >
                <Link to="/monitor/rsi" className="flex items-center gap-4 group">
                  <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.15)] group-hover:shadow-[0_0_30px_rgba(168,85,247,0.3)] group-hover:bg-purple-500/20 transition-all duration-300">
                    <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">show_chart</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-lg md:text-2xl font-bold dark:text-white light:text-text-dark group-hover:text-purple-500 transition-colors tracking-tight">RSI Divergence</h3>
                    <span className="text-xs dark:text-gray-400 light:text-text-light-secondary tracking-widest font-mono uppercase opacity-70">Strategy C-12 • Momentum</span>
                  </div>
                </Link>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-500 text-[11px] font-bold border border-purple-500/20 animate-pulse">
                    <AnimatedNumber value={rsiSummary.total} /> ACTIVE
                  </span>
                  <button
                    className="toggle-button w-8 h-8 flex items-center justify-center rounded-full dark:hover:bg-white/10 light:hover:bg-slate-200 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAccordion('rsiDivergence-content');
                    }}
                  >
                    <span className={`material-symbols-outlined text-xl transition-transform duration-300 ${isExpanded('rsiDivergence-content') ? 'rotate-180 text-purple-500' : 'dark:text-gray-500 light:text-slate-500'}`}>expand_more</span>
                  </button>
                </div>
              </div>
              <div
                className={`accordion-content ${isExpanded('rsiDivergence-content') ? 'expanded' : ''}`}
                id="rsiDivergence-content"
              >
                <div className="p-4 md:p-6 flex flex-col gap-3">
                  {['1h', '4h', '1d'].map((tf) => (
                    <Link
                      key={tf}
                      to={`/monitor/rsi?timeframe=${tf}`}
                      className="w-full flex justify-between items-center p-3 md:p-4 rounded-xl dark:border-white/5 light:border-green-300 dark:bg-white/[0.01] hover:bg-purple-500/5 hover:border-purple-500/20 transition-all cursor-pointer group/item relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      <div className="flex items-center gap-4 relative z-10">
                        <span className="w-12 h-8 flex items-center justify-center rounded-md text-sm font-black bg-purple-500/10 text-purple-500 border border-purple-500/20 font-mono group-hover/item:bg-purple-500 group-hover/item:text-white transition-colors">
                          {tf.toUpperCase()}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium dark:text-gray-300 light:text-slate-600 dark:group-hover/item:text-white light:group-hover/item:text-text-dark transition-colors">
                            {tf === '1h' ? 'Hourly Scalping' : tf === '4h' ? 'Swing Setups' : 'Daily Structure'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                        <span className={`font-mono font-bold text-lg ${rsiSummary.timeframes[tf as Timeframe] > 0 ? 'dark:text-white light:text-text-dark' : 'dark:text-gray-600 light:text-slate-400'}`}>
                          <AnimatedNumber value={rsiSummary.timeframes[tf as Timeframe]} />
                        </span>
                        <span className="material-symbols-outlined text-sm dark:text-gray-600 mr-2 group-hover/item:translate-x-1 transition-transform text-purple-500">arrow_forward</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* CRT (Candle Range Theory) */}
            <motion.div
              variants={listItemVariants}
              whileHover={{ scale: 1.005 }}
              className="glass-panel rounded-2xl relative z-[5] overflow-hidden group/card"
            >
              <div
                className={`p-4 md:p-6 flex items-center justify-between cursor-pointer transition-all ${isExpanded('crt-content') ? 'accordion-header-expanded' : ''}`}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) {
                    toggleAccordion('crt-content');
                  }
                }}
              >
                <Link to="/monitor/crt" className="flex items-center gap-4 group">
                  <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)] group-hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] group-hover:bg-amber-500/20 transition-all duration-300">
                    <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">target</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-lg md:text-2xl font-bold dark:text-white light:text-text-dark group-hover:text-amber-500 transition-colors tracking-tight">CRT</h3>
                    <span className="text-xs dark:text-gray-400 light:text-text-light-secondary tracking-widest font-mono uppercase opacity-70">Strategy D-07 • Liquidity Grab</span>
                  </div>
                </Link>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[11px] font-bold border border-amber-500/20 animate-pulse">
                    <AnimatedNumber value={crtSummary.total} /> ACTIVE
                  </span>
                  <button
                    className="toggle-button w-8 h-8 flex items-center justify-center rounded-full dark:hover:bg-white/10 light:hover:bg-slate-200 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAccordion('crt-content');
                    }}
                  >
                    <span className={`material-symbols-outlined text-xl transition-transform duration-300 ${isExpanded('crt-content') ? 'rotate-180 text-amber-500' : 'dark:text-gray-500 light:text-slate-500'}`}>expand_more</span>
                  </button>
                </div>
              </div>
              <div
                className={`accordion-content ${isExpanded('crt-content') ? 'expanded' : ''}`}
                id="crt-content"
              >
                <div className="p-4 md:p-6 flex flex-col gap-3">
                  {['1h', '4h', '1d', '1w'].map((tf) => (
                    <Link
                      key={tf}
                      to={`/monitor/crt?timeframe=${tf}`}
                      className="w-full flex justify-between items-center p-3 md:p-4 rounded-xl dark:border-white/5 light:border-green-300 dark:bg-white/[0.01] hover:bg-amber-500/5 hover:border-amber-500/20 transition-all cursor-pointer group/item relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      <div className="flex items-center gap-4 relative z-10">
                        <span className="w-12 h-8 flex items-center justify-center rounded-md text-sm font-black bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono group-hover/item:bg-amber-500 group-hover/item:text-black transition-colors">
                          {tf.toUpperCase()}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium dark:text-gray-300 light:text-slate-600 dark:group-hover/item:text-white light:group-hover/item:text-text-dark transition-colors">
                            {tf === '1h' ? 'Hourly Sweep' : tf === '4h' ? 'Mid-Term Sweep' : tf === '1d' ? 'Daily Liquidity' : 'Macro Sweep'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                        <span className={`font-mono font-bold text-lg ${crtSummary.timeframes[tf as Timeframe] > 0 ? 'dark:text-white light:text-text-dark' : 'dark:text-gray-600 light:text-slate-400'}`}>
                          <AnimatedNumber value={crtSummary.timeframes[tf as Timeframe]} />
                        </span>
                        <span className="material-symbols-outlined text-sm dark:text-gray-600 mr-2 group-hover/item:translate-x-1 transition-transform text-amber-500">arrow_forward</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* CISD (Change in State of Delivery) */}
            <motion.div
              variants={listItemVariants}
              whileHover={{ scale: 1.005 }}
              className="glass-panel rounded-2xl relative z-[5] overflow-hidden group/card"
            >
              <div
                className={`p-4 md:p-6 flex items-center justify-between cursor-pointer transition-all ${isExpanded('cisd-content') ? 'accordion-header-expanded' : ''}`}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) {
                    toggleAccordion('cisd-content');
                  }
                }}
              >
                <Link to="/monitor/cisd" className="flex items-center gap-4 group">
                  <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.15)] group-hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] group-hover:bg-cyan-500/20 transition-all duration-300">
                    <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">change_circle</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-lg md:text-2xl font-bold dark:text-white light:text-text-dark group-hover:text-cyan-500 transition-colors tracking-tight">CISD</h3>
                    <span className="text-xs dark:text-gray-400 light:text-text-light-secondary tracking-widest font-mono uppercase opacity-70">MSS · Fib 50% · Retest</span>
                  </div>
                </Link>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-500 text-[11px] font-bold border border-cyan-500/20 animate-pulse">
                    <AnimatedNumber value={cisdSummary.total} /> ACTIVE
                  </span>
                  <button
                    className="toggle-button w-8 h-8 flex items-center justify-center rounded-full dark:hover:bg-white/10 light:hover:bg-slate-200 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAccordion('cisd-content');
                    }}
                  >
                    <span className={`material-symbols-outlined text-xl transition-transform duration-300 ${isExpanded('cisd-content') ? 'rotate-180 text-cyan-500' : 'dark:text-gray-500 light:text-slate-500'}`}>expand_more</span>
                  </button>
                </div>
              </div>
              <div
                className={`accordion-content ${isExpanded('cisd-content') ? 'expanded' : ''}`}
                id="cisd-content"
              >
                <div className="p-4 md:p-6 flex flex-col gap-3">
                  {['4h', '1d', '1w'].map((tf) => (
                    <Link
                      key={tf}
                      to={`/monitor/cisd?timeframe=${tf}`}
                      className="w-full flex justify-between items-center p-3 md:p-4 rounded-xl dark:border-white/5 light:border-green-300 dark:bg-white/[0.01] hover:bg-cyan-500/5 hover:border-cyan-500/20 transition-all cursor-pointer group/item relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      <div className="flex items-center gap-4 relative z-10">
                        <span className="w-12 h-8 flex items-center justify-center rounded-md text-sm font-black bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 font-mono group-hover/item:bg-cyan-500 group-hover/item:text-black transition-colors">
                          {tf.toUpperCase()}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium dark:text-gray-300 light:text-slate-600 dark:group-hover/item:text-white light:group-hover/item:text-text-dark transition-colors">
                            {tf === '4h' ? 'Swing CISD' : tf === '1d' ? 'Daily structure' : 'Weekly CISD'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                        <span className={`font-mono font-bold text-lg ${cisdSummary.timeframes[tf as Timeframe] > 0 ? 'dark:text-white light:text-text-dark' : 'dark:text-gray-600 light:text-slate-400'}`}>
                          <AnimatedNumber value={cisdSummary.timeframes[tf as Timeframe]} />
                        </span>
                        <span className="material-symbols-outlined text-sm dark:text-gray-600 mr-2 group-hover/item:translate-x-1 transition-transform text-cyan-500">arrow_forward</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* 3-OB (Three Order Blocks) */}
            <motion.div
              variants={listItemVariants}
              whileHover={{ scale: 1.005 }}
              className="glass-panel rounded-2xl relative z-[5] overflow-hidden group/card"
            >
              <div
                className={`p-4 md:p-6 flex items-center justify-between cursor-pointer transition-all ${isExpanded('3ob-content') ? 'accordion-header-expanded' : ''}`}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) {
                    toggleAccordion('3ob-content');
                  }
                }}
              >
                <Link to="/monitor/3ob" className="flex items-center gap-4 group">
                  <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-500 shadow-[0_0_20px_rgba(139,92,246,0.15)] group-hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] group-hover:bg-violet-500/20 transition-all duration-300">
                    <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">layers</span>
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-lg md:text-2xl font-bold dark:text-white light:text-text-dark group-hover:text-violet-500 transition-colors tracking-tight">3-OB</h3>
                    <span className="text-xs dark:text-gray-400 light:text-text-light-secondary tracking-widest font-mono uppercase opacity-70">Strategy E-08 • Order Blocks</span>
                  </div>
                </Link>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 rounded-full bg-violet-500/10 text-violet-500 text-[11px] font-bold border border-violet-500/20 animate-pulse">
                    <AnimatedNumber value={threeObSummary.total} /> ACTIVE
                  </span>
                  <button
                    className="toggle-button w-8 h-8 flex items-center justify-center rounded-full dark:hover:bg-white/10 light:hover:bg-slate-200 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAccordion('3ob-content');
                    }}
                  >
                    <span className={`material-symbols-outlined text-xl transition-transform duration-300 ${isExpanded('3ob-content') ? 'rotate-180 text-violet-500' : 'dark:text-gray-500 light:text-slate-500'}`}>expand_more</span>
                  </button>
                </div>
              </div>
              <div
                className={`accordion-content ${isExpanded('3ob-content') ? 'expanded' : ''}`}
                id="3ob-content"
              >
                <div className="p-4 md:p-6 flex flex-col gap-3">
                  {['4h', '1d', '1w'].map((tf) => (
                    <Link
                      key={tf}
                      to={`/monitor/3ob?timeframe=${tf}`}
                      className="w-full flex justify-between items-center p-3 md:p-4 rounded-xl dark:border-white/5 light:border-green-300 dark:bg-white/[0.01] hover:bg-violet-500/5 hover:border-violet-500/20 transition-all cursor-pointer group/item relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      <div className="flex items-center gap-4 relative z-10">
                        <span className="w-12 h-8 flex items-center justify-center rounded-md text-sm font-black bg-violet-500/10 text-violet-500 border border-violet-500/20 font-mono group-hover/item:bg-violet-500 group-hover/item:text-white transition-colors">
                          {tf.toUpperCase()}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium dark:text-gray-300 light:text-slate-600 dark:group-hover/item:text-white light:group-hover/item:text-text-dark transition-colors">
                            {tf === '4h' ? 'Mid-Term Structure' : tf === '1d' ? 'Daily OB Stack' : 'Macro Blocks'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                        <span className={`font-mono font-bold text-lg ${threeObSummary.timeframes[tf as Timeframe] > 0 ? 'dark:text-white light:text-text-dark' : 'dark:text-gray-600 light:text-slate-400'}`}>
                          <AnimatedNumber value={threeObSummary.timeframes[tf as Timeframe]} />
                        </span>
                        <span className="material-symbols-outlined text-sm dark:text-gray-600 mr-2 group-hover/item:translate-x-1 transition-transform text-violet-500">arrow_forward</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>

          </motion.div>

          <motion.div
            variants={listItemVariants}
            className="mt-8 flex justify-center opacity-60"
          >
            <span className="text-xs font-mono text-primary uppercase tracking-[0.5em] animate-pulse-slow">System Operational • V2.4.0</span>
          </motion.div>
        </div>
      </div>

    </motion.div>
  );
};
