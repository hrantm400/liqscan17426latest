import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { StatusTabs } from '../components/shared/StatusTabs';
import { SignalStatusBadge } from '../components/shared/SignalStatusBadge';
import { Signal } from '../types';
import { fetchLiveBiasForTimeframes } from '../services/signalsApi';
import { StaticMiniChart } from '../components/StaticMiniChart';
import { FilterMenu } from '../components/shared/FilterMenu';
import { TrendIndicator } from '../components/shared/TrendIndicator';
import { TimeDisplay } from '../components/shared/TimeDisplay';
import { PageHeader } from '../components/layout/PageHeader';
import { AnimatedCard } from '../components/animations/AnimatedCard';
import { AnimatedNumber } from '../components/animations/AnimatedNumber';
import { useMarketData } from '../hooks/useMarketData';
import { fetchCandles } from '../services/candles';
import { useSignalFilter } from '../hooks/useSignalFilter';
import { useLifecycleFilter } from '../hooks/useLifecycleFilter';
import { scaleInVariants } from '../utils/animations';
import { formatRelativeTimeAgo } from '../utils/formatRelativeTime';
import { useVolumeData } from '../hooks/useVolumeData';
import { useMarketCapData } from '../hooks/useMarketCapData';
import { VolumeBadge } from '../components/shared/VolumeFilter';
import { useTierGating } from '../hooks/useTierGating';
import { FavoriteStar } from '../components/shared/FavoriteStar';

import { useFloatingChartStore } from '../store/floatingChartStore';
import { useClickOutside } from '../hooks/useClickOutside';

const BIAS_LIVE_TFS = ['4h', '1d', '1w'] as const;

// Component for signal card with static mini chart
function SignalCardWithChart({ signal, isLong }: { signal: Signal; isLong: boolean }) {
  const { data: candlesData } = useQuery({
    queryKey: ['candles', signal.symbol, signal.timeframe, 'mini'],
    queryFn: () => fetchCandles(signal.symbol, signal.timeframe, 50),
    enabled: !!signal?.symbol && !!signal?.timeframe,
    staleTime: 300000,
  });

  const candles = candlesData || [];

  return (
    <div className="h-32 w-full relative border-y dark:border-y-white/5 light:border-y-green-200/30 overflow-hidden">
      <StaticMiniChart candles={candles} isLong={isLong} height={128} />
    </div>
  );
}

// Symbol Avatar Component
function SymbolAvatar({ symbol }: { symbol: string }) {
  const firstLetter = symbol.charAt(0).toUpperCase();
  const colors = [
    'bg-orange-500/20 text-orange-500 ring-orange-500/40',
    'bg-purple-500/20 text-purple-500 ring-purple-500/40',
    'bg-teal-500/20 text-teal-500 ring-teal-500/40',
    'bg-red-500/20 text-red-500 ring-red-500/40',
    'bg-blue-500/20 text-blue-500 ring-blue-500/40',
    'bg-green-500/20 text-green-500 ring-green-500/40',
    'bg-pink-500/20 text-pink-500 ring-pink-500/40',
    'bg-blue-600/20 text-blue-600 ring-blue-600/40',
  ];
  const colorIndex = symbol.charCodeAt(0) % colors.length;
  return (
    <div className={`w-6 h-6 rounded-full ${colors[colorIndex]} flex items-center justify-center text-[10px] font-bold ring-1`}>
      {firstLetter}
    </div>
  );
}

// Helper functions for Bias signals
function getBiasType(signal: Signal): string {
  const metadata = signal.metadata as any;
  if (metadata?.biasType) {
    return metadata.biasType;
  }
  const bias = metadata?.bias || signal.signalType;
  if (bias === 'BULLISH' || bias === 'BUY') {
    return 'Bullish Confirmation';
  } else if (bias === 'BEARISH' || bias === 'SELL') {
    return 'Bearish Reversal';
  }
  return 'Trend Continuation';
}

function getTrendStrength(signal: Signal): { label: string; color: string; icon: string } {
  const metadata = signal.metadata as any;
  const confidence = metadata?.confidence || 'MED';
  const bias = metadata?.bias || signal.signalType;
  const isBullish = bias === 'BULLISH' || bias === 'BUY';

  if (confidence === 'HIGH') {
    return {
      label: isBullish ? 'Strong' : 'High',
      color: isBullish ? 'primary' : 'red-500',
      icon: isBullish ? 'trending_up' : 'trending_down',
    };
  } else if (confidence === 'MED') {
    return {
      label: 'Med',
      color: 'yellow-500',
      icon: 'trending_flat',
    };
  } else {
    return {
      label: isBullish ? 'High' : 'Weak',
      color: isBullish ? 'primary' : 'red-500',
      icon: isBullish ? 'trending_up' : 'trending_down',
    };
  }
}

export function MonitorBias() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { hasFullProductAccess, isSymbolAllowed: baseIsSymbolAllowed, hasFeature } = useTierGating();
  const { addChart } = useFloatingChartStore();

  // Feature access check
  const hasBiasAccess = hasFeature('ict_bias');
  const isTierPaid = hasFullProductAccess || hasBiasAccess;
  const isSymbolAllowed = useCallback((symbol: string) => isTierPaid || baseIsSymbolAllowed(symbol, 'ict_bias'), [isTierPaid, baseIsSymbolAllowed]);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [selectedTimeframes, setSelectedTimeframes] = useState<Set<string>>(() => {
    const tf = searchParams.get('timeframe');
    return tf ? new Set([tf]) : new Set();
  });
  const [bullFilter, setBullFilter] = useState('All');
  const [bearFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'time' | 'symbol'>('time');
  const [marketCapSort, setMarketCapSort] = useState<'high-low' | 'low-high' | null>(null);
  const [volumeSort, setVolumeSort] = useState<'high-low' | 'low-high' | null>(null);
  const [rankingFilter, setRankingFilter] = useState<number | null>(null);
  const [directionFilter, setDirectionFilter] = useState<'All' | 'Longs' | 'Shorts'>('All');
  const [statusFilter, setStatusFilter] = useState<any>('LIVE');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuContainerRef = useRef<HTMLDivElement>(null);
  useClickOutside(filterMenuContainerRef, () => setFilterMenuOpen(false), filterMenuOpen);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);


  const { volumeMap, getVolume, isLowVolume, formatVolume, isLoading: isVolumeLoading } = useVolumeData();
  const { marketCapMap, getRank } = useMarketCapData();

  // Sync selectedTimeframes with URL
  useEffect(() => {
    const tf = searchParams.get('timeframe');
    if (tf) {
      setSelectedTimeframes(new Set([tf]));
    }
  }, [searchParams]);

  // Use the new useMarketData hook
  const { signals: rawSignals, isLoading: isSignalsLoading, refetch } = useMarketData({
    strategyType: 'ICT_BIAS',
    limit: 5000, // Increased limit to show all signals
    refetchInterval: 60000,
  });

  const isLoading = isSignalsLoading || isVolumeLoading;

  const { data: liveBiasByTf } = useQuery({
    queryKey: ['live-bias', ...BIAS_LIVE_TFS],
    queryFn: () => fetchLiveBiasForTimeframes([...BIAS_LIVE_TFS]),
    refetchInterval: 65000, // Slightly above the 60s backend cache TTL
    staleTime: 30000,
  });

  // Override saved bias with live bias per symbol+timeframe (never apply 4h data to 1d rows)
  const signals = useMemo(() => {
    if (!liveBiasByTf) return rawSignals;
    const hasAny = BIAS_LIVE_TFS.some((tf) => Object.keys(liveBiasByTf[tf] ?? {}).length > 0);
    if (!hasAny) return rawSignals;
    return rawSignals.map((signal) => {
      const tf = signal.timeframe.toLowerCase();
      const live = liveBiasByTf[tf]?.[signal.symbol];
      if (!live) return signal;
      // Override metadata.bias and signalType with live values
      const newSignalType = live.direction === 'NEUTRAL'
        ? signal.signalType
        : (live.direction as 'BUY' | 'SELL');
      return {
        ...signal,
        signalType: newSignalType,
        metadata: {
          ...(signal.metadata || {}),
          bias: live.bias,
          prevHigh: live.prevHigh,
          prevLow: live.prevLow,
        },
      };
    });
  }, [rawSignals, liveBiasByTf]);

  // Global Valid Signals for strict 20M Volume enforcement across status tabs
  const globalValidSignals = useMemo(() => {
    if (!volumeMap || volumeMap.size === 0) return signals;
    return signals.filter((s) => (volumeMap.get(s.symbol) || 0) >= 20_000_000);
  }, [signals, volumeMap]);

  const statusCounts = useMemo(() => {
    return {
      total: globalValidSignals.length,
      live: globalValidSignals.filter((s) => s.lifecycleStatus === 'PENDING' || s.lifecycleStatus === 'ACTIVE').length,
      closed: globalValidSignals.filter((s) => s.lifecycleStatus === 'COMPLETED' || s.lifecycleStatus === 'EXPIRED').length,
      archive: globalValidSignals.filter((s) => s.lifecycleStatus === 'ARCHIVED').length,
    };
  }, [globalValidSignals]);

  // Use the new useSignalFilter hook
  const filteredSignals = useSignalFilter({
    signals,
    searchQuery,
    activeTimeframe: undefined,
    bullFilter,
    bearFilter,
    directionFilter,
    sortBy,
    marketCapSort,
    volumeSort,
    rankingFilter,
    showClosedSignals: true,
    strategyType: 'ICT_BIAS',

    volumeMap,
    marketCapMap,
  });

  // Apply status filter FIRST (for counts)
  const statusFilteredSignals = useLifecycleFilter({
    signals: filteredSignals,
    tab: statusFilter,
  });

  // Calculate signals by timeframe
  // ICT Bias uses only 4h, 1d, 1w timeframes
  const timeframeStats = useMemo(() => {
    const stats: Record<string, number> = {
      '4h': 0,
      '1d': 0,
      '1w': 0,
    };
    statusFilteredSignals.forEach((signal) => {
      const tf = signal.timeframe.toLowerCase();
      if (tf === '4h' || tf === '1d' || tf === '1w') {
        stats[tf] = (stats[tf] || 0) + 1;
      }
    });
    return stats;
  }, [statusFilteredSignals]);

  // Apply timeframe filter manually and sort accessible signals to the top
  const timeframeFilteredSignals = useMemo(() => {
    let filtered = statusFilteredSignals;
    if (selectedTimeframes.size > 0) {
      filtered = statusFilteredSignals.filter(s => selectedTimeframes.has(s.timeframe.toLowerCase()));
    }
    return [...filtered].sort((a, b) => {
      const aAllowed = isTierPaid || isSymbolAllowed(a.symbol);
      const bAllowed = isTierPaid || isSymbolAllowed(b.symbol);
      if (aAllowed && !bAllowed) return -1;
      if (!aAllowed && bAllowed) return 1;
      return 0;
    });
  }, [statusFilteredSignals, selectedTimeframes, isSymbolAllowed, isTierPaid]);

  // Pagination
  const totalPages = Math.ceil(timeframeFilteredSignals.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedSignals = timeframeFilteredSignals.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTimeframes, searchQuery, bullFilter, bearFilter, directionFilter, sortBy, statusFilter]);

  const toggleTimeframe = useCallback((timeframe: string) => {
    setSelectedTimeframes(prev => {
      const next = new Set(prev);
      if (next.has(timeframe)) {
        next.delete(timeframe);
      } else {
        next.add(timeframe);
      }
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setSortBy('time');
    setMarketCapSort(null);
    setVolumeSort(null);
    setRankingFilter(null);
    setDirectionFilter('All');
    setStatusFilter('ALL');
    setBullFilter('All');
    setSearchQuery('');
    setSelectedTimeframes(new Set());
    setSearchParams({});
  }, [setSearchParams]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="dark:text-white light:text-text-dark text-lg"
        >
          Loading signals...
        </motion.div>
      </div>
    );
  }



  return (
    <>
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Monitor', path: '/monitor/bias' },
          { label: 'Bias Shifts Scans' },
        ]}
        lastUpdated="Just now"
        onRefresh={refetch}
      />

      {/* Timeframe Cards */}
      <motion.div
        initial="initial"
        animate="animate"
        variants={scaleInVariants}
        className="flex flex-col gap-4 px-4 md:px-6 pt-2 pb-2 shrink-0"
      >
        <div className="flex overflow-x-auto md:overflow-visible snap-x no-scrollbar gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 pb-2 md:pb-0">
          {/* 4H */}
          <AnimatedCard
            className={`group relative flex flex-col justify-between p-5 rounded-xl border transition-all cursor-pointer h-36 min-w-[85vw] md:min-w-0 snap-center md:snap-align-none ${timeframeStats['4h'] > 0
              ? selectedTimeframes.has('4h')
                ? 'glass-panel ring-2 ring-primary/50 shadow-glow-intense scale-[1.02]'
                : 'glass-panel hover:shadow-glow hover:scale-[1.01]'
              : 'glass-panel opacity-50 cursor-not-allowed hover:opacity-60'
              }`}
            onClick={() => {
              if (timeframeStats['4h'] > 0) {
                toggleTimeframe('4h');
              }
            }}
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${timeframeStats['4h'] > 0 ? 'dark:text-white light:text-text-dark' : 'dark:text-gray-400 light:text-slate-400'}`}>
                  4H Timeframe
                </span>
                {selectedTimeframes.has('4h') && (
                  <span className="material-symbols-outlined text-primary text-base animate-pulse" title="Click again to deselect">
                    check_circle
                  </span>
                )}
              </div>
              {timeframeStats['4h'] > 0 ? (
                <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-[0_0_10px_rgba(19,236,55,0.2)] ${selectedTimeframes.has('4h')
                  ? 'text-primary bg-primary/20 border-primary/40'
                  : 'text-primary bg-primary/10 border-primary/20'
                  }`}>
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  {selectedTimeframes.has('4h') ? 'Selected' : 'Active'}
                </span>
              ) : (
                <span className="text-[10px] font-bold dark:text-gray-400 light:text-slate-400 uppercase tracking-wider dark:bg-white/5 light:bg-green-100 px-2 py-0.5 rounded-full dark:border-white/5 light:border-green-300">
                  No Signals
                </span>
              )}
            </div>
            <div className="mt-auto">
              <span
                className={`text-5xl font-black tracking-tight ${timeframeStats['4h'] > 0
                  ? 'text-primary drop-shadow-[0_0_12px_rgba(19,236,55,0.6)]'
                  : 'dark:text-gray-500 light:text-slate-400'
                  }`}
              >
                <AnimatedNumber value={timeframeStats['4h']} />
              </span>
              <span className={`text-xs ml-1 font-medium uppercase tracking-wide ${timeframeStats['4h'] > 0 ? 'dark:text-gray-400 light:text-slate-500' : 'dark:text-gray-500 light:text-slate-400'}`}>
                Signals Detected
              </span>
            </div>
          </AnimatedCard>

          {/* 1D */}
          <AnimatedCard
            className={`group relative flex flex-col justify-between p-5 rounded-xl border transition-all cursor-pointer h-36 min-w-[85vw] md:min-w-0 snap-center md:snap-align-none ${timeframeStats['1d'] > 0
              ? selectedTimeframes.has('1d')
                ? 'glass-panel ring-2 ring-primary/50 shadow-glow-intense scale-[1.02]'
                : 'glass-panel hover:shadow-glow hover:scale-[1.01]'
              : 'glass-panel opacity-50 cursor-not-allowed hover:opacity-60'
              }`}
            onClick={() => {
              if (timeframeStats['1d'] > 0) {
                toggleTimeframe('1d');
              }
            }}
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${timeframeStats['1d'] > 0 ? 'dark:text-white light:text-text-dark' : 'dark:text-gray-400 light:text-slate-400'}`}>
                  1D Timeframe
                </span>
                {selectedTimeframes.has('1d') && (
                  <span className="material-symbols-outlined text-primary text-base animate-pulse" title="Click again to deselect">
                    check_circle
                  </span>
                )}
              </div>
              {timeframeStats['1d'] > 0 ? (
                <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-[0_0_10px_rgba(19,236,55,0.2)] ${selectedTimeframes.has('1d')
                  ? 'text-primary bg-primary/20 border-primary/40'
                  : 'text-primary bg-primary/10 border-primary/20'
                  }`}>
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  {selectedTimeframes.has('1d') ? 'Selected' : 'Active'}
                </span>
              ) : (
                <span className="text-[10px] font-bold dark:text-gray-400 light:text-slate-400 uppercase tracking-wider dark:bg-white/5 light:bg-green-100 px-2 py-0.5 rounded-full dark:border-white/5 light:border-green-300">
                  No Signals
                </span>
              )}
            </div>
            <div className="mt-auto">
              <span
                className={`text-5xl font-black tracking-tight ${timeframeStats['1d'] > 0
                  ? 'text-primary drop-shadow-[0_0_8px_rgba(19,236,55,0.5)]'
                  : 'dark:text-gray-500 light:text-slate-400'
                  }`}
              >
                <AnimatedNumber value={timeframeStats['1d']} />
              </span>
              <span className={`text-xs ml-1 font-medium uppercase tracking-wide ${timeframeStats['1d'] > 0 ? 'dark:text-gray-400 light:text-slate-500' : 'dark:text-gray-500 light:text-slate-400'}`}>
                Signals Detected
              </span>
            </div>
          </AnimatedCard>

          {/* 1W */}
          <AnimatedCard
            className={`group relative flex flex-col justify-between p-5 rounded-xl border transition-all cursor-pointer h-36 min-w-[85vw] md:min-w-0 snap-center md:snap-align-none ${timeframeStats['1w'] > 0
              ? selectedTimeframes.has('1w')
                ? 'glass-panel ring-2 ring-primary/50 shadow-glow-intense scale-[1.02]'
                : 'glass-panel hover:shadow-glow hover:scale-[1.01]'
              : 'glass-panel opacity-50 cursor-not-allowed hover:opacity-60'
              }`}
            onClick={() => {
              if (timeframeStats['1w'] > 0) {
                toggleTimeframe('1w');
              }
            }}
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${timeframeStats['1w'] > 0 ? 'dark:text-white light:text-text-dark' : 'dark:text-gray-400 light:text-slate-400'}`}>
                  1W Timeframe
                </span>
                {selectedTimeframes.has('1w') && (
                  <span className="material-symbols-outlined text-primary text-base animate-pulse" title="Click again to deselect">
                    check_circle
                  </span>
                )}
              </div>
              {timeframeStats['1w'] > 0 ? (
                <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-[0_0_10px_rgba(19,236,55,0.2)] ${selectedTimeframes.has('1w')
                  ? 'text-primary bg-primary/20 border-primary/40'
                  : 'text-primary bg-primary/10 border-primary/20'
                  }`}>
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  {selectedTimeframes.has('1w') ? 'Selected' : 'Active'}
                </span>
              ) : (
                <span className="text-[10px] font-bold dark:text-gray-400 light:text-slate-400 uppercase tracking-wider dark:bg-white/5 light:bg-green-100 px-2 py-0.5 rounded-full dark:border-white/5 light:border-green-300">
                  No Signals
                </span>
              )}
            </div>
            <div className="mt-auto">
              <span
                className={`text-5xl font-black tracking-tight ${timeframeStats['1w'] > 0
                  ? 'text-primary drop-shadow-[0_0_8px_rgba(19,236,55,0.5)]'
                  : 'dark:text-gray-500 light:text-slate-400'
                  }`}
              >
                <AnimatedNumber value={timeframeStats['1w']} />
              </span>
              <span className={`text-xs ml-1 font-medium uppercase tracking-wide ${timeframeStats['1w'] > 0 ? 'dark:text-gray-400 light:text-slate-500' : 'dark:text-gray-500 light:text-slate-400'}`}>
                Signals Detected
              </span>
            </div>
          </AnimatedCard>
        </div>

        {/* Status Tabs */}
        <StatusTabs
          strategyType="ICT_BIAS"
          activeStatus={statusFilter}
          onStatusChange={setStatusFilter}
          hideArchive={true}
          counts={statusCounts}
        />
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 px-4 md:px-6 pb-4 md:pb-6 flex flex-col">
        <div className="mx-auto w-full max-w-[1600px] flex flex-col gap-3 min-h-full">
          {/* Filters Bar */}
          <div className="flex items-center gap-2 py-2 dark:bg-background-dark/50 dark:backdrop-blur-sm light:bg-white/80 light:backdrop-blur-sm sticky top-0 z-20 flex-wrap overflow-visible shrink-0">
            {/* Search */}
            <motion.div
              whileFocus={{ scale: 1.02 }}
              className="relative w-32 shrink-0 transition-all duration-300 focus-within:w-48 group/search"
            >
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 dark:text-gray-500 light:text-text-light-secondary text-lg dark:group-focus-within/search:text-white light:group-focus-within/search:text-text-dark transition-colors">
                search
              </span>
              <input
                className="w-full pl-9 pr-3 py-1.5 rounded-full dark:bg-white/5 light:bg-green-50/80 dark:border-white/10 light:border light:border-green-200/60 dark:text-white light:text-text-dark text-xs dark:placeholder:text-gray-600 light:placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/45 transition-all outline-none"
                placeholder="Search..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </motion.div>
            <div className="w-px h-5 dark:bg-white/10 light:bg-green-300 mx-1 shrink-0"></div>

            {/* Direction Filter */}
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-2xl dark:bg-white/5 light:bg-green-50/80 light:border light:border-green-200/60 dark:border-white/5 shrink-0 border">
              <span className="text-[10px] font-black dark:text-gray-400 light:text-text-light-secondary uppercase tracking-widest pl-1 mr-1">
                SIDE
              </span>
              {['All', 'Longs', 'Shorts'].map((dir) => (
                <button
                  key={dir}
                  onClick={() => setDirectionFilter(dir as any)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                    directionFilter === dir
                      ? 'bg-primary text-black shadow-[0_0_10px_rgba(19,236,55,0.4)] border-primary'
                      : 'border-transparent dark:text-gray-400 light:text-text-light-secondary dark:hover:bg-white/10 light:hover:bg-green-100 hover:text-primary transition-all'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
            <div className="w-px h-5 dark:bg-white/10 light:bg-green-300 mx-1 shrink-0"></div>

            {/* Filter Menu */}
            <div ref={filterMenuContainerRef} className="relative group/more">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors group whitespace-nowrap ${filterMenuOpen
                  ? 'dark:bg-white/10 light:bg-green-100 border-primary/30 dark:text-white light:text-text-dark active:bg-primary/10 active:border-primary/30'
                  : 'dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 dark:text-gray-300 light:text-text-light-secondary dark:hover:bg-white/10 light:hover:bg-green-100 dark:hover:text-white light:hover:text-text-dark'
                  }`}
              >
                <span className={`material-symbols-outlined text-sm ${filterMenuOpen ? 'text-primary' : 'group-hover:text-primary transition-colors'}`}>
                  filter_list
                </span>
                Filter
              </motion.button>
              <FilterMenu
                isOpen={filterMenuOpen}
                sortBy={sortBy}
                onSortChange={setSortBy}
                marketCapSort={marketCapSort}
                onMarketCapSortChange={setMarketCapSort}
                volumeSort={volumeSort}
                onVolumeSortChange={setVolumeSort}
                rankingFilter={rankingFilter}
                onRankingFilterChange={setRankingFilter}
                onReset={handleResetFilters}
              />
            </div>

            <div className="w-px h-5 dark:bg-white/10 light:bg-green-300 mx-1 shrink-0"></div>

            {/* View Toggle */}
            <div className="flex p-1 gap-1 rounded-lg dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 shrink-0">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-all ${viewMode === 'list' ? 'bg-primary text-black' : 'dark:text-gray-400 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
                  }`}
                title="List View"
              >
                <span className="material-symbols-outlined text-base">view_list</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-primary text-black' : 'dark:text-gray-400 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
                  }`}
                title="Grid View"
              >
                <span className="material-symbols-outlined text-base">grid_view</span>
              </motion.button>
            </div>
          </div>

          {/* Content Container */}
          <div className="flex-1 min-h-0 relative flex gap-4">
            {viewMode === 'list' ? (
              /* List View - Table */
              <div className="flex-1 flex flex-col min-w-0 rounded-xl table-glass-panel dark:border-[#234829] light:border-green-300 overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 relative">

                  {/* Desktop Table */}
                  <table className="hidden md:table w-full text-sm text-left dark:text-gray-400 light:text-text-light-secondary">
                    <thead className="text-[11px] uppercase dark:text-gray-500 light:text-text-light-secondary font-bold sticky top-0 dark:bg-[#0a140d] light:bg-green-50 dark:border-b-white/10 light:border-b-green-300 z-10 tracking-wider">
                      <tr>
                        <th 
                          className="px-6 py-3 cursor-pointer hover:text-white transition-colors group" 
                          scope="col"
                          onClick={() => setSortBy('symbol')}
                        >
                          <div className="flex items-center gap-1">
                            Symbol
                            <span className={`material-symbols-outlined text-[10px] ${sortBy === 'symbol' ? 'text-primary' : 'opacity-0 group-hover:opacity-50'}`}>sort</span>
                          </div>
                        </th>
                        <th className="px-6 py-3" scope="col">Exchange</th>
                        <th className="px-6 py-3" scope="col">TF</th>
                        <th className="px-6 py-3" scope="col">Bias Type</th>
                        <th className="px-6 py-3 text-center" scope="col">Status</th>
                        <th className="px-6 py-3 text-center" scope="col">Trend</th>
                        <th 
                          className="px-6 py-3 text-right cursor-pointer hover:text-white transition-colors group" 
                          scope="col"
                          onClick={() => setMarketCapSort(marketCapSort === 'high-low' ? 'low-high' : 'high-low')}
                        >
                          <div className="flex items-center justify-end gap-1">
                            CMC Rank
                            {marketCapSort ? (
                              <span className="material-symbols-outlined text-[10px] text-primary">
                                {marketCapSort === 'high-low' ? 'arrow_downward' : 'arrow_upward'}
                              </span>
                            ) : (
                              <span className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-50">sort</span>
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-right cursor-pointer hover:text-white transition-colors group" 
                          scope="col"
                          onClick={() => setVolumeSort(volumeSort === 'high-low' ? 'low-high' : 'high-low')}
                        >
                          <div className="flex items-center justify-end gap-1">
                            Volume (24h)
                            {volumeSort ? (
                              <span className="material-symbols-outlined text-[10px] text-primary">
                                {volumeSort === 'high-low' ? 'arrow_downward' : 'arrow_upward'}
                              </span>
                            ) : (
                              <span className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-50">sort</span>
                            )}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-right" scope="col">Detected</th>
                        <th className="px-6 py-3 text-right" scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="dark:divide-y-white/5 light:divide-y-green-200/30 text-xs font-medium">
                      {statusFilteredSignals.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center dark:text-gray-500 light:text-text-light-secondary">
                            No signals found
                          </td>
                        </tr>
                      ) : (
                        paginatedSignals.map((signal, index) => {
                          const biasType = getBiasType(signal);
                          const isLocked = !isTierPaid && !isSymbolAllowed(signal.symbol);

                          return (
                            <motion.tr
                              key={signal.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05, duration: 0.3 }}
                              className={`dark:hover:bg-white/5 light:hover:bg-green-100 transition-colors cursor-pointer group`}
                              onClick={() => !isLocked && navigate(`/signals/${signal.id}`)}
                            >
                              <td className="px-6 py-2.5 font-bold dark:text-white light:text-text-dark whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  {!isLocked && <FavoriteStar symbol={signal.symbol} />}
                                  <SymbolAvatar symbol={signal.symbol} />
                                  <span className="text-sm">{signal.symbol}</span>
                                  {isLocked && <span className="material-symbols-outlined text-amber-500 text-[14px] ml-1" title="PRO Access Required">lock</span>}
                                </div>
                              </td>
                              <td className={`px-6 py-2.5 whitespace-nowrap dark:text-gray-400 light:text-text-light-secondary dark:group-hover:text-gray-300 light:text-slate-600 light:group-hover:text-text-dark ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                                Binance Perp
                              </td>
                              <td className={`px-6 py-2.5 whitespace-nowrap dark:text-white light:text-text-dark font-bold uppercase ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                                {signal.timeframe}
                              </td>
                              <td className={`px-6 py-2.5 whitespace-nowrap dark:text-white light:text-text-dark ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>{biasType}</td>
                              <td className={`px-6 py-2.5 text-center ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                                <SignalStatusBadge signal={signal} />
                              </td>
                              <td className={`px-6 py-2.5 text-center ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                                <TrendIndicator signal={signal} />
                              </td>
                              <td className={`px-6 py-2.5 text-right font-mono text-xs dark:text-gray-300 light:text-slate-600 ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                                {getRank(signal.symbol) ? `#${getRank(signal.symbol)}` : '—'}
                              </td>
                              <td className={`px-6 py-2.5 text-right ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                                <VolumeBadge volume={getVolume(signal.symbol)} formatVolume={formatVolume} isLow={isLowVolume(signal.symbol)} />
                              </td>
                              <td className={`px-6 py-2.5 text-right font-mono dark:text-gray-300 light:text-slate-600 whitespace-nowrap ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                                <TimeDisplay date={signal.detectedAt} timeframe={signal.timeframe} format="full" showUtcLabel={false} />
                              </td>
                              <td className="px-6 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  {!isLocked && <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        addChart({
                                            id: `${signal.strategyType}-${signal.symbol}-${signal.timeframe}`,
                                            symbol: signal.symbol,
                                            strategyType: signal.strategyType,
                                            timeframe: signal.timeframe,
                                            signalId: signal.id,
                                        });
                                    }}
                                    className="p-1.5 rounded-lg dark:hover:bg-white/10 light:hover:bg-green-100 dark:text-gray-400 light:text-slate-500 hover:text-primary transition-colors"
                                    title="Open in Mini-Player"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">picture_in_picture_alt</span>
                                  </button>}
                                  <Link
                                    to={`/signals/${signal.id}`}
                                    className={`text-primary dark:hover:text-white light:hover:text-text-dark font-medium ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}
                                  >
                                    Analyze
                                  </Link>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>

                  {/* Mobile Card List */}
                  <div className="md:hidden flex flex-col gap-3 p-4">
                    {statusFilteredSignals.length === 0 ? (
                      <div className="text-center py-8 text-sm dark:text-gray-500 light:text-text-light-secondary">
                        No signals found
                      </div>
                    ) : (
                      paginatedSignals.map((signal, index) => {
                        const biasType = getBiasType(signal);
                        const isLocked = !isTierPaid && !isSymbolAllowed(signal.symbol);

                        return (
                          <motion.div
                            key={signal.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.02, duration: 0.2 }}
                            onClick={() => !isLocked && navigate(`/signals/${signal.id}`)}
                            className={`relative flex flex-col gap-3 p-4 rounded-xl dark:bg-black/20 light:bg-white border dark:border-white/5 light:border-green-200 shadow-sm active:scale-[0.98] transition-all`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                {!isLocked && <FavoriteStar symbol={signal.symbol} />}
                                <SymbolAvatar symbol={signal.symbol} />
                                <span className="font-bold text-base dark:text-white light:text-slate-800">{signal.symbol}</span>
                                {isLocked && <span className="material-symbols-outlined text-amber-500 text-[14px]" title="PRO Access Required">lock</span>}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 dark:text-white light:text-slate-800 border ${isLocked ? 'blur-[5px] select-none' : ''}`}>
                                  TF: {signal.timeframe}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 ${isLocked ? 'blur-[5px] select-none' : ''}`}>
                                  {biasType}
                                </span>
                              </div>
                              <div className={`flex flex-col items-end ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                                <span className="text-xs font-mono dark:text-gray-400 light:text-slate-500">
                                  <TimeDisplay date={signal.detectedAt} timeframe={signal.timeframe} format="full" showUtcLabel={false} />
                                </span>
                                <span className="text-[10px] font-mono dark:text-gray-500 light:text-slate-400 mt-0.5">
                                  Rank: {getRank(signal.symbol) ? `#${getRank(signal.symbol)}` : '—'}
                                </span>
                              </div>
                            </div>

                            <div className={`flex items-center justify-between mt-2 ${isLocked ? 'blur-[5px] select-none pointer-events-none' : ''}`}>
                              <div className="flex items-center gap-2">
                                <SignalStatusBadge signal={signal} />
                                <TrendIndicator signal={signal} />
                              </div>
                              <div className="flex items-center gap-3">
                                {!isLocked && <button
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      addChart({
                                          id: `${signal.strategyType}-${signal.symbol}-${signal.timeframe}`,
                                          symbol: signal.symbol,
                                          strategyType: signal.strategyType,
                                          timeframe: signal.timeframe,
                                          signalId: signal.id,
                                      });
                                  }}
                                  className="p-1.5 rounded-lg dark:bg-white/5 light:bg-green-50 dark:hover:bg-white/10 light:hover:bg-green-100 dark:text-gray-400 light:text-slate-500 hover:text-primary transition-colors"
                                  title="Open in Mini-Player"
                                >
                                  <span className="material-symbols-outlined text-[16px]">picture_in_picture_alt</span>
                                </button>}
                                <VolumeBadge volume={getVolume(signal.symbol)} formatVolume={formatVolume} isLow={isLowVolume(signal.symbol)} />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
                {/* Pagination */}
                {filteredSignals.length > 0 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t dark:border-white/5 light:border-green-300 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs dark:text-gray-400 light:text-text-light-secondary">Show:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="px-2 py-1 rounded dark:bg-white/5 light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={30}>30</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-xs dark:text-gray-400 light:text-text-light-secondary">
                        of {statusFilteredSignals.length} signals
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/10 transition-colors"
                      >
                        Previous
                      </button>
                      <span className="text-xs dark:text-gray-400 light:text-text-light-secondary">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/10 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Grid View - Cards */
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1600px] mx-auto">
                  {statusFilteredSignals.length === 0 ? (
                    <div className="col-span-full text-center py-12 dark:text-gray-500 light:text-text-light-secondary">No signals found</div>
                  ) : (
                    paginatedSignals.map((signal, index) => {
                      const trend = getTrendStrength(signal);
                      const biasType = getBiasType(signal);
                      const metadata = signal.metadata as any;
                      const bias = metadata?.bias || signal.signalType;
                      const isLong = bias === 'BULLISH' || bias === 'BUY';

                      return (
                        <motion.div
                          key={signal.id}
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ delay: index * 0.05, duration: 0.3 }}
                        >
                          <AnimatedCard
                            onClick={() => navigate(`/signals/${signal.id}`)}
                            className={`glass-panel rounded-2xl overflow-hidden relative group cursor-pointer flex flex-col ${isLong ? 'long-glow' : 'short-glow'
                              }`}
                          >
                            <div className="p-5 flex justify-between items-start z-10 relative">
                              <div className="flex flex-col">
                                <h3 className="text-xl font-bold dark:text-white light:text-text-dark tracking-tight">{signal.symbol}</h3>
                                <span className="text-xs dark:text-gray-400 light:text-text-light-secondary font-mono mt-1">Binance Perp</span>
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider shadow-[0_0_10px_rgba(19,236,55,0.2)] ${isLong
                                  ? 'bg-primary/10 border border-primary/20 text-primary'
                                  : 'bg-red-500/10 border border-red-500/20 text-red-500'
                                  }`}
                              >
                                {biasType}
                              </span>
                            </div>
                            <SignalCardWithChart signal={signal} isLong={isLong} />
                            <div className="p-4 dark:bg-surface-dark/50 light:bg-green-50 flex justify-between items-center text-sm mt-auto">
                              <div className="flex flex-col">
                                <span className="text-[10px] uppercase dark:text-gray-500 light:text-text-light-secondary font-bold tracking-wider mb-0.5">Bias</span>
                                <span className="font-mono dark:text-white light:text-text-dark font-medium">{biasType}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] uppercase dark:text-gray-500 light:text-text-light-secondary font-bold tracking-wider mb-0.5">Trend</span>
                                <span
                                  className={`font-mono font-bold ${trend.color === 'primary'
                                    ? 'text-primary'
                                    : trend.color === 'red-500'
                                      ? 'text-red-500'
                                      : 'text-yellow-500'
                                    }`}
                                >
                                  {trend.label}
                                </span>
                              </div>
                            </div>
                            <div className="px-4 py-2 dark:bg-black/20 light:bg-green-50 dark:border-t-white/5 light:border-t-green-300 flex justify-between items-center relative z-20">
                              <div className="flex items-center gap-1.5">
                                {signal.metadata?.confidence === 'HIGH' ? (
                                  <>
                                    <motion.div
                                      className={`w-1.5 h-1.5 rounded-full ${isLong ? 'bg-primary' : 'bg-red-500'}`}
                                      animate={{ opacity: [1, 0.5, 1] }}
                                      transition={{ duration: 2, repeat: Infinity }}
                                    />
                                    <span className={`text-[10px] font-bold uppercase ${isLong ? 'text-primary' : 'text-red-500'}`}>Active Signal</span>
                                  </>
                                ) : (
                                  <>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isLong ? 'bg-primary' : 'bg-red-500'}`}></div>
                                    <span className="text-[10px] dark:text-gray-400 light:text-text-light-secondary font-bold uppercase">Bias Shift</span>
                                  </>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    addChart({
                                        id: `${signal.strategyType}-${signal.symbol}-${signal.timeframe}`,
                                        symbol: signal.symbol,
                                        strategyType: signal.strategyType,
                                        timeframe: signal.timeframe,
                                        signalId: signal.id,
                                    });
                                }}
                                className="p-1.5 rounded-lg dark:hover:bg-white/10 light:hover:bg-green-100 dark:text-gray-400 light:text-slate-500 hover:text-primary transition-colors ml-auto z-30 relative"
                                title="Open in Mini-Player"
                              >
                                <span className="material-symbols-outlined text-[16px]">picture_in_picture_alt</span>
                              </button>
                              <span className="text-[10px] dark:text-gray-500 light:text-text-light-secondary font-medium ml-3">
                                {formatRelativeTimeAgo(signal.detectedAt)}
                              </span>
                            </div>
                          </AnimatedCard>
                        </motion.div>
                      );
                    })
                  )}
                </div>
                {/* Pagination */}
                {statusFilteredSignals.length > 0 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t dark:border-white/5 light:border-green-300 shrink-0 mt-6">
                    <div className="flex items-center gap-2">
                      <span className="text-xs dark:text-gray-400 light:text-text-light-secondary">Show:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="px-2 py-1 rounded dark:bg-white/5 light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={30}>30</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-xs dark:text-gray-400 light:text-text-light-secondary">
                        of {statusFilteredSignals.length} signals
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/10 transition-colors"
                      >
                        Previous
                      </button>
                      <span className="text-xs dark:text-gray-400 light:text-text-light-secondary">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/10 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
