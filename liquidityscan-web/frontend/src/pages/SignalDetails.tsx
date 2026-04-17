import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Signal } from '../types';
import { fetchCandles } from '../services/candles';
import { fetchSignalById, fetchSignals } from '../services/signalsApi';
import { InteractiveLiveChartGate } from '../components/InteractiveLiveChartGate';
import { isCisdFamilySignal } from '../utils/drawCisdOverlays';
import { SignalBadge } from '../components/shared/SignalBadge';
import { TimeDisplay } from '../components/shared/TimeDisplay';
import { NeonLoader } from '../components/shared/NeonLoader';
import { scaleInVariants, fadeInVariants } from '../utils/animations';
import { formatRelativeTimeAgo } from '../utils/formatRelativeTime';
import { FavoriteStar } from '../components/shared/FavoriteStar';
import { useFloatingChartStore } from '../store/floatingChartStore';

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

// Dynamically format price based on its magnitude
function formatPrice(price: number): string {
  const abs = Math.abs(price);
  if (abs === 0) return '0.00';
  if (abs >= 1000) return price.toFixed(2);
  if (abs >= 1) return price.toFixed(4);
  if (abs >= 0.01) return price.toFixed(6);
  if (abs >= 0.0001) return price.toFixed(8);
  return price.toFixed(10);
}

const LAST_SIGNAL_CTX_KEY = 'lastSignalContext';
const SIGNAL_CTX_VERSION = 1;
/** Keeps sessionStorage small (~tens of KB) vs full Signal JSON (MB+). */
const MAX_STORED_SIGNAL_IDS = 800;

type SignalNavPeer = { id: string; symbol: string };

function findSignalInCache(queryClient: QueryClient, signalId: string): Signal | undefined {
  const allCachedQueries = queryClient.getQueriesData<Signal[]>({ queryKey: ['signals'] });
  for (const [, list] of allCachedQueries) {
    if (!Array.isArray(list)) continue;
    const found = list.find((s) => s.id === signalId);
    if (found) return found;
  }
  return undefined;
}

/** Read ordered signal ids from sessionStorage (new `{v,ids}` or legacy full `Signal[]`). */
function parseStoredSignalOrder(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as { v?: number }).v === SIGNAL_CTX_VERSION &&
      Array.isArray((parsed as { ids?: unknown }).ids)
    ) {
      return ((parsed as { ids: unknown[] }).ids).filter((x): x is string => typeof x === 'string');
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      if (typeof parsed[0] === 'string') return parsed as string[];
      if (parsed[0] && typeof parsed[0] === 'object' && 'id' in (parsed[0] as object)) {
        return (parsed as Signal[]).map((s) => s.id).filter(Boolean);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function sliceIdsAroundCurrent(ids: string[], currentId: string): string[] {
  if (ids.length <= MAX_STORED_SIGNAL_IDS) return ids;
  const idx = ids.indexOf(currentId);
  if (idx < 0) return ids.slice(0, MAX_STORED_SIGNAL_IDS);
  const half = Math.floor(MAX_STORED_SIGNAL_IDS / 2);
  const start = Math.max(0, Math.min(idx - half, ids.length - MAX_STORED_SIGNAL_IDS));
  return ids.slice(start, start + MAX_STORED_SIGNAL_IDS);
}

function persistSignalOrder(ids: string[]) {
  const payload = JSON.stringify({ v: SIGNAL_CTX_VERSION, ids });
  const trySet = (value: string) => {
    sessionStorage.setItem(LAST_SIGNAL_CTX_KEY, value);
  };
  try {
    trySet(payload);
  } catch (e) {
    const isQuota =
      (e instanceof DOMException || e instanceof Error) && e.name === 'QuotaExceededError';
    if (!isQuota) return;
    try {
      sessionStorage.removeItem(LAST_SIGNAL_CTX_KEY);
    } catch {
      /* ignore */
    }
    for (const cap of [200, 80, 40]) {
      try {
        trySet(JSON.stringify({ v: SIGNAL_CTX_VERSION, ids: ids.slice(0, cap) }));
        return;
      } catch {
        /* try smaller */
      }
    }
  }
}

function navPeerFromId(queryClient: QueryClient, peerId: string): SignalNavPeer {
  const cached = findSignalInCache(queryClient, peerId);
  return { id: peerId, symbol: cached?.symbol ?? '…' };
}

function navPeerFromSignal(s: Signal): SignalNavPeer {
  return { id: s.id, symbol: s.symbol };
}

export function SignalDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candles4H, setCandles4H] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const { addChart } = useFloatingChartStore();

  const handlePriceUpdate = useCallback((price: number, change: number) => {
    setCurrentPrice(price);
    setPriceChange(change);
  }, []);

  const { data: signal, isLoading } = useQuery({
    queryKey: ['signal', id],
    queryFn: async (): Promise<Signal | null> => {
      if (!id) return null;

      // Search ALL cached signal lists using fuzzy prefix matching
      // (keys are ['signals', strategyType, timeframe])
      const allCachedQueries = queryClient.getQueriesData<Signal[]>({
        queryKey: ['signals'],
      });
      for (const [, list] of allCachedQueries) {
        if (!Array.isArray(list)) continue;
        const found = list.find((s) => s.id === id);
        if (found) return found;
      }

      // Fallback: fetch from the API
      return fetchSignalById(id);
    },
    enabled: !!id,
    refetchInterval: 60000,
  });

  // Fetch candle data from backend /api/candles (Binance klines)
  const { data: historicalCandles, isLoading: isLoadingCandles } = useQuery({
    queryKey: ['candles', signal?.symbol, signal?.timeframe],
    queryFn: async () => {
      if (!signal?.symbol || !signal?.timeframe) return [];
      return fetchCandles(signal.symbol, signal.timeframe, 300);
    },
    enabled: !!signal?.symbol && !!signal?.timeframe,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 60000,
  });

  // Initialize candles from historical data
  useEffect(() => {
    if (historicalCandles && historicalCandles.length > 0) {
      setCandles(historicalCandles as Candle[]);
    }
  }, [historicalCandles]);

  // Handle candle updates from chart
  const handleCandleUpdate = useCallback((candle: Candle) => {
    setCandles(prev => {
      const updated = [...prev];
      const index = updated.findIndex(c =>
        new Date(c.openTime).getTime() === new Date(candle.openTime).getTime()
      );

      if (index >= 0) {
        updated[index] = candle;
      } else {
        updated.push(candle);
        updated.sort((a, b) => new Date(a.openTime).getTime() - new Date(b.openTime).getTime());
      }

      return updated;
    });
  }, []);

  // --- Prev / Next navigation across cached signal lists ---
  // IMPORTANT: Must be before early returns to satisfy React hooks rules
  const { prevSignal, nextSignal } = useMemo((): {
    prevSignal: SignalNavPeer | null;
    nextSignal: SignalNavPeer | null;
  } => {
    if (!id) return { prevSignal: null, nextSignal: null };

    const allCachedQueries = queryClient.getQueriesData<Signal[]>({
      queryKey: ['signals'],
    });

    let allSignals: Signal[] = [];
    for (const [, list] of allCachedQueries) {
      if (!Array.isArray(list)) continue;
      allSignals = allSignals.concat(list);
    }

    const seen = new Set<string>();
    allSignals = allSignals.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    if (allSignals.length > 0) {
      const orderedIds = allSignals.map((s) => s.id);
      persistSignalOrder(sliceIdsAroundCurrent(orderedIds, id));

      const currentIdx = allSignals.findIndex((s) => s.id === id);
      if (currentIdx === -1) return { prevSignal: null, nextSignal: null };

      return {
        prevSignal: currentIdx > 0 ? navPeerFromSignal(allSignals[currentIdx - 1]) : null,
        nextSignal:
          currentIdx < allSignals.length - 1 ? navPeerFromSignal(allSignals[currentIdx + 1]) : null,
      };
    }

    const storedIds = parseStoredSignalOrder(sessionStorage.getItem(LAST_SIGNAL_CTX_KEY));
    if (!storedIds || storedIds.length === 0) {
      return { prevSignal: null, nextSignal: null };
    }

    const currentIdx = storedIds.indexOf(id);
    if (currentIdx === -1) return { prevSignal: null, nextSignal: null };

    const prevId = currentIdx > 0 ? storedIds[currentIdx - 1] : undefined;
    const nextId = currentIdx < storedIds.length - 1 ? storedIds[currentIdx + 1] : undefined;

    return {
      prevSignal: prevId ? navPeerFromId(queryClient, prevId) : null,
      nextSignal: nextId ? navPeerFromId(queryClient, nextId) : null,
    };
  }, [id, queryClient]);

  const isCisdFamilyPage = Boolean(signal && isCisdFamilySignal(signal));

  const { data: cisdRelatedRaw = [] } = useQuery({
    queryKey: ['signals', 'CISD', 5000, 'signalDetailsRelated'],
    queryFn: () => fetchSignals('CISD', 5000),
    enabled: isCisdFamilyPage && !!signal?.symbol && !!signal?.timeframe,
    staleTime: 60_000,
  });

  const cisdRelatedForChart = useMemo(() => {
    if (!isCisdFamilyPage || !signal?.symbol || !signal?.timeframe) return undefined;
    return cisdRelatedRaw.filter(
      (s) => s.symbol === signal.symbol && s.timeframe === signal.timeframe,
    );
  }, [isCisdFamilyPage, cisdRelatedRaw, signal?.symbol, signal?.timeframe]);



  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="dark:text-white light:text-text-dark text-lg"
        >
          Loading signal details...
        </motion.div>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="dark:text-white light:text-text-dark text-lg"
        >
          Signal not found
        </motion.div>
      </div>
    );
  }

  const signalData = signal as Signal;
  const detectedDate = new Date(signalData.detectedAt);

  // Derive strategy type from signal ID
  const getStrategyType = ():
    | 'SUPER_ENGULFING'
    | 'RSI_DIVERGENCE'
    | 'ICT_BIAS'
    | 'CRT'
    | '3OB'
    | 'CISD' => {
    if (
      signalData.strategyType === 'RSI_DIVERGENCE' ||
      signalData.strategyType === 'RSIDIVERGENCE' ||
      signalData.id?.startsWith('RSI_DIVERGENCE') ||
      signalData.id?.startsWith('RSIDIVERGENCE')
    )
      return 'RSI_DIVERGENCE';
    if (signalData.strategyType === 'ICT_BIAS' || signalData.id?.startsWith('ICT_BIAS')) return 'ICT_BIAS';
    const st = signalData.strategyType as string;
    if (st === 'CISD' || st === 'CISD_RETEST' || signalData.id?.startsWith('CISD-') || signalData.id?.startsWith('CISD_RETEST'))
      return 'CISD';
    if (signalData.strategyType === '3OB' || signalData.id?.startsWith('3OB')) return '3OB';
    if (signalData.strategyType === 'CRT' || signalData.id?.startsWith('CRT')) return 'CRT';
    return 'SUPER_ENGULFING';
  };
  const strategyType = getStrategyType();

  const getStrategyLabel = () => {
    if (strategyType === 'RSI_DIVERGENCE') return 'RSI Divergence';
    if (strategyType === 'ICT_BIAS') return 'ICT Bias';
    if (strategyType === 'CRT') return 'CRT';
    if (strategyType === '3OB') return '3-OB';
    if (strategyType === 'CISD') return 'CISD';
    return 'SuperEngulfing';
  };

  const getStrategyMonitorPath = () => {
    if (strategyType === 'RSI_DIVERGENCE') return '/monitor/rsi';
    if (strategyType === 'ICT_BIAS') return '/monitor/bias';
    if (strategyType === 'CRT') return '/monitor/crt';
    if (strategyType === '3OB') return '/monitor/3ob';
    if (strategyType === 'CISD') return '/monitor/cisd';
    return '/monitor/superengulfing';
  };

  const getPatternType = () => {
    if (strategyType === 'RSI_DIVERGENCE') {
      return signalData.signalType === 'BUY' ? 'Bullish Divergence' : 'Bearish Divergence';
    }
    if (strategyType === 'ICT_BIAS') {
      const bias = (signalData.metadata as any)?.bias || '';
      if (bias === 'BULLISH') return 'Bullish Bias';
      if (bias === 'BEARISH') return 'Bearish Bias';
      return 'ICT Bias';
    }
    if (strategyType === 'CRT') {
      return signalData.signalType === 'BUY' ? 'Bullish CRT' : 'Bearish CRT';
    }
    if (strategyType === '3OB') {
      return signalData.signalType === 'BUY' ? 'Bullish 3-OB' : 'Bearish 3-OB';
    }
    if (strategyType === 'CISD') {
      return signalData.signalType === 'BUY' ? 'Bullish CISD' : 'Bearish CISD';
    }
    return signalData.signalType === 'BUY' ? 'Bullish Engulfing' : 'Bearish Engulfing';
  };

  const getPatternVariant = () => {
    if (strategyType === 'RSI_DIVERGENCE') {
      const rsiVal = (signalData.metadata as any)?.rsiValue;
      return rsiVal ? `RSI ${Number(rsiVal).toFixed(1)}` : 'Divergence';
    }
    if (strategyType === 'ICT_BIAS') {
      return signalData.signalType === 'BUY' ? 'Long' : 'Short';
    }
    if (strategyType === 'CRT') {
      return signalData.signalType === 'BUY' ? 'Bullish sweep' : 'Bearish sweep';
    }
    if (strategyType === '3OB') {
      return 'Three order blocks';
    }
    if (strategyType === 'CISD') {
      const dir = (signalData.metadata as any)?.cisd_direction;
      return dir === 'BEAR' ? 'Bearish setup' : dir === 'BULL' ? 'Bullish setup' : 'MSS + Fib 50%';
    }
    // SuperEngulfing
    const pattern = signalData.metadata?.type || signalData.metadata?.pattern || 'RUN';
    if (pattern === 'RUN_PLUS') return 'Run+';
    if (pattern === 'REV_PLUS') return 'Rev+';
    if (pattern === 'REV') return 'Rev';
    return 'Run';
  };

  const getTimeframeDisplay = () => {
    const tf = signalData.timeframe;
    if (tf === '1d') return 'Daily';
    if (tf === '4h') return '4 Hour';
    if (tf === '1h') return '1 Hour';
    if (tf === '15m') return '15 Minute';
    if (tf === '5m') return '5 Minute';
    if (tf === '1w') return 'Weekly';
    return (tf as string).toUpperCase();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Use candles state if available, otherwise use historicalCandles
  const chartCandles = candles.length > 0 ? candles : (historicalCandles || []);

  const showCandlesLoading = isLoadingCandles && chartCandles.length === 0;

  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-8 py-3 md:py-4 dark:bg-background-dark/80 light:bg-background-light/80 backdrop-blur-md dark:border-b-white/5 light:border-b-green-200/30">
        <div className="flex items-center gap-2 text-[8px] md:text-[10px] font-bold tracking-widest uppercase">
          <Link to={getStrategyMonitorPath()} className="dark:text-gray-500 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark cursor-pointer transition-colors">
            Monitor
          </Link>
          <span className="material-symbols-outlined text-[10px] dark:text-gray-600 light:text-text-light-secondary">chevron_right</span>
          <span className="text-primary drop-shadow-[0_0_5px_rgba(19,236,55,0.5)]">{getStrategyLabel()} Scans</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <span className="hidden md:flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-bold dark:bg-white/5 light:bg-green-50/50 dark:border-white/10 light:border-green-200/30 dark:text-gray-400 light:text-text-light-secondary uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Live Feed
          </span>
          <div className="hidden md:block h-4 w-px dark:bg-white/10 light:bg-green-200/30"></div>

          {/* Prev / Next Signal Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => prevSignal && navigate(`/signals/${prevSignal.id}`)}
              disabled={!prevSignal}
              className={`flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                prevSignal
                  ? 'dark:bg-white/5 light:bg-green-50/50 dark:hover:bg-white/10 light:hover:bg-green-100/50 dark:text-gray-300 light:text-text-dark cursor-pointer'
                  : 'dark:bg-white/3 light:bg-gray-100/30 dark:text-gray-600 light:text-gray-400 cursor-not-allowed opacity-40'
              }`}
              title={prevSignal ? `Previous: ${prevSignal.symbol}` : 'No previous signal'}
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
              <span className="hidden md:inline">{prevSignal ? prevSignal.symbol : 'Prev'}</span>
            </button>
            <button
              onClick={() => nextSignal && navigate(`/signals/${nextSignal.id}`)}
              disabled={!nextSignal}
              className={`flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                nextSignal
                  ? 'dark:bg-white/5 light:bg-green-50/50 dark:hover:bg-white/10 light:hover:bg-green-100/50 dark:text-gray-300 light:text-text-dark cursor-pointer'
                  : 'dark:bg-white/3 light:bg-gray-100/30 dark:text-gray-600 light:text-gray-400 cursor-not-allowed opacity-40'
              }`}
              title={nextSignal ? `Next: ${nextSignal.symbol}` : 'No next signal'}
            >
              <span className="hidden md:inline">{nextSignal ? nextSignal.symbol : 'Next'}</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>

          <div className="h-4 w-px dark:bg-white/10 light:bg-green-200/30"></div>
          
          <button
            onClick={() => {
                if (signalData) {
                    addChart({
                        id: `${signalData.strategyType}-${signalData.symbol}-${signalData.timeframe}`,
                        symbol: signalData.symbol,
                        strategyType: signalData.strategyType,
                        timeframe: signalData.timeframe,
                        signalId: signalData.id,
                    });
                }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all dark:bg-white/5 light:bg-green-50/50 dark:hover:bg-primary/20 light:hover:bg-primary/20 dark:text-gray-300 light:text-text-dark dark:hover:text-primary light:hover:text-primary cursor-pointer border dark:border-white/5 light:border-green-200/50 dark:hover:border-primary/50 light:hover:border-primary/50"
            title="Open in Mini-Player"
          >
            <span className="material-symbols-outlined text-[16px]">picture_in_picture_alt</span>
            <span className="hidden lg:inline">Mini-Player</span>
          </button>

          <div className="h-4 w-px dark:bg-white/10 light:bg-green-200/30"></div>
          
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg dark:bg-white/5 light:bg-green-50/50 dark:hover:bg-white/10 light:hover:bg-green-100/50 dark:text-gray-400 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar ${isFullscreen ? 'p-0' : 'p-4 pt-4 md:p-8 md:pt-6'}`}>
        <div className={`${isFullscreen ? 'h-screen' : 'max-w-[1600px] mx-auto'} flex flex-col gap-6`}>
          {/* Title Section */}
          {!isFullscreen && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary tracking-wider uppercase">Crypto Signal</span>
                <span className="w-1 h-1 rounded-full dark:bg-gray-600 light:bg-text-light-secondary"></span>
                <span className="text-xs font-medium dark:text-gray-500 light:text-text-light-secondary">Created {formatRelativeTimeAgo(detectedDate)}</span>
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <h1 className="text-3xl md:text-5xl font-sans tracking-tight flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-black dark:text-white light:text-text-dark">{signalData.symbol}</span>
                  </div>
                </h1>
                
                <div className="flex flex-wrap items-center gap-3 xl:ml-2">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(19,236,55,0.2)] w-fit shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span> Active
                  </span>
                  <FavoriteStar symbol={signalData.symbol} className="scale-125 shrink-0" />
                  
                  <div className="hidden xl:block w-px h-6 dark:bg-white/10 light:bg-green-200/50 mx-1"></div>
                  
                  {/* Inline Metadata Header substituting the cards */}
                  <div className="flex flex-wrap items-center gap-4 dark:bg-white/5 light:bg-green-50/50 px-4 py-2 rounded-xl border dark:border-white/5 light:border-green-200/30">
                     <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold dark:text-gray-500 light:text-text-light-secondary uppercase tracking-widest">Type</span>
                       <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${signalData.signalType === 'BUY' ? 'text-[#089981] bg-[#089981]/10' : 'text-[#F23645] bg-[#F23645]/10'}`}>
                         {signalData.signalType === 'BUY' ? 'LONG' : 'SHORT'}
                       </span>
                     </div>
                     <div className="w-px h-4 dark:bg-white/10 light:bg-green-200/50 hidden sm:block"></div>
                     <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold dark:text-gray-500 light:text-text-light-secondary uppercase tracking-widest">Timeframe</span>
                       <span className="text-xs font-bold dark:text-white light:text-text-dark font-mono bg-white/5 px-2 py-0.5 rounded">{getTimeframeDisplay()}</span>
                     </div>
                     <div className="w-px h-4 dark:bg-white/10 light:bg-green-200/50 hidden sm:block"></div>
                     <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold dark:text-gray-500 light:text-text-light-secondary uppercase tracking-widest">Price</span>
                       <span className="text-xs font-bold font-mono text-primary">{currentPrice !== null ? formatPrice(currentPrice) : formatPrice(Number(signalData.price))}</span>
                     </div>
                     <div className="w-px h-4 dark:bg-white/10 light:bg-green-200/50 hidden sm:block"></div>
                     <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold dark:text-gray-500 light:text-text-light-secondary uppercase tracking-widest">Quality</span>
                       <SignalBadge signal={signalData} variant="numeric" />
                     </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main Content Grid */}
          <div className={`grid ${isFullscreen ? 'grid-cols-1' : 'grid-cols-12'} gap-6`}>
            {/* Left Column - Chart(s) */}
            <div className={`${isFullscreen ? 'col-span-1' : 'col-span-12 xl:col-span-9'} flex flex-col gap-6`}>

              <div className={`${isFullscreen ? 'fixed inset-0 z-[100] dark:bg-background-dark light:bg-background-light' : 'glass-panel rounded-2xl h-[720px]'} p-1 relative overflow-hidden group flex flex-col`}>
                  <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                    <span className="px-3 py-1.5 rounded dark:bg-black/40 light:bg-white/70 backdrop-blur-md dark:border-white/10 light:border-green-200/50 text-xs font-mono dark:text-gray-300 light:text-text-dark">
                      {getTimeframeDisplay()} Timeframe
                    </span>
                    <span className="px-3 py-1.5 rounded dark:bg-black/40 light:bg-white/70 backdrop-blur-md dark:border-white/10 light:border-green-200/50 text-xs font-mono text-primary">
                      {signalData.symbol}
                    </span>
                  </div>


                  {showCandlesLoading ? (
                    <div className="relative flex-1 dark:bg-[#0b140d] light:bg-white rounded-xl overflow-hidden dark:border-white/5 light:border-green-200/50 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-4">
                        <NeonLoader className="scale-75" />
                        <div className="dark:text-gray-400 light:text-text-light-secondary text-sm">Loading chart data...</div>
                      </div>
                    </div>
                  ) : chartCandles.length === 0 ? (
                    <div className="relative flex-1 dark:bg-[#0b140d] light:bg-white rounded-xl overflow-hidden dark:border-white/5 light:border-green-200/50 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-4">
                        <span className="material-symbols-outlined text-4xl dark:text-gray-600 light:text-text-light-secondary">bar_chart</span>
                        <div className="dark:text-gray-400 light:text-text-light-secondary text-sm">No chart data available</div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex-1 dark:bg-[#0b140d] light:bg-white rounded-xl overflow-hidden dark:border-white/5 light:border-green-200/50">
                      <InteractiveLiveChartGate
                        candles={chartCandles as Candle[]}
                        signal={signalData}
                        relatedSignals={cisdRelatedForChart}
                        symbol={signalData.symbol}
                        timeframe={signalData.timeframe}
                        height={isFullscreen ? window.innerHeight - 100 : 720}
                        isFullscreen={isFullscreen}
                        onCandleUpdate={handleCandleUpdate}
                        onPriceUpdate={handlePriceUpdate}
                      />
                    </div>
                  )}

                  <div className="absolute top-3 right-3 z-[110] flex items-center gap-2">
                    <button
                      onClick={toggleFullscreen}
                      className="p-1.5 rounded-xl backdrop-blur-md dark:bg-black/40 light:bg-white/70 border dark:border-white/10 light:border-green-200/50 dark:text-gray-400 light:text-text-dark hover:dark:text-white hover:light:text-text-dark transition-all shadow-lg"
                      title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isFullscreen ? 'close_fullscreen' : 'open_in_full'}
                      </span>
                    </button>
                  </div>
                </div>

            </div>

            {/* Right Column - Actions & Context */}
            {!isFullscreen && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="col-span-12 xl:col-span-3 flex flex-col gap-6"
              >
                {/* Execution Actions */}
                <motion.div
                  initial="initial"
                  animate="animate"
                  variants={scaleInVariants}
                  className="glass-panel rounded-2xl p-6 flex flex-col gap-6"
                >
                  <div className="flex items-center gap-2 pb-4 dark:border-b-white/5 light:border-b-green-200/30">
                    <span className="material-symbols-outlined text-primary text-xl">bolt</span>
                    <h3 className="text-lg font-bold dark:text-white light:text-text-dark">Execution Actions</h3>
                  </div>
                  <div className="flex flex-col gap-3">
                    <motion.a
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      href={`https://www.tradingview.com/chart/?symbol=${signalData.symbol}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-5 py-3.5 rounded-full bg-white text-black font-bold hover:bg-gray-100 transition-all group shadow-lg shadow-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-2xl">change_history</span>
                        <div className="flex flex-col items-start leading-none">
                          <span className="text-xs md:text-sm">Open in</span>
                          <span className="text-xs md:text-sm font-black">TradingView</span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">open_in_new</span>
                    </motion.a>
                    <motion.a
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      href={`https://www.binance.com/en/trade/${signalData.symbol}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-5 py-3.5 rounded-full bg-[#FCD535] text-black font-bold hover:brightness-105 transition-all group shadow-lg shadow-[#FCD535]/10"
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-2xl">diamond</span>
                        <span className="text-sm font-black">Trade on Binance</span>
                      </div>
                      <span className="material-symbols-outlined group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform">
                        north_east
                      </span>
                    </motion.a>
                    <motion.a
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      href={`https://www.bybit.com/trade/usdt/${signalData.symbol}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-5 py-3.5 rounded-full bg-[#17181e] text-white border border-white/10 font-bold hover:bg-[#23262b] transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-2xl">layers</span>
                        <span className="text-sm font-black">Trade on Bybit</span>
                      </div>
                      <span className="material-symbols-outlined dark:text-gray-400 light:text-slate-500 group-hover:text-white group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform">
                        north_east
                      </span>
                    </motion.a>
                  </div>
                  <div className="h-px dark:bg-white/5 light:bg-green-200/30 mx-2"></div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3 rounded-full border border-dashed dark:border-white/20 light:border-green-200/50 text-xs font-bold dark:text-gray-400 light:text-text-light-secondary uppercase tracking-widest dark:hover:text-white light:hover:text-text-dark dark:hover:border-white/40 light:hover:border-green-200/70 dark:hover:bg-white/5 light:hover:bg-green-100/50 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">sync</span>
                    Recheck Status
                  </motion.button>
                </motion.div>

                {/* Signal Context — SE Lifecycle Details */}
                <motion.div
                  initial="initial"
                  animate="animate"
                  variants={scaleInVariants}
                  className="glass-panel rounded-2xl p-6 flex flex-col gap-5 flex-1"
                >
                  <h3 className="text-sm font-bold dark:text-white light:text-text-dark uppercase tracking-wider mb-2">Signal Context</h3>

                  {/* Lifecycle Status */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">Status</span>
                    <span className="font-mono font-bold text-sm">
                      {signalData.lifecycleStatus === 'COMPLETED' && signalData.result === 'WIN' && (
                        <span className="text-emerald-400">✅ WIN</span>
                      )}
                      {signalData.lifecycleStatus === 'COMPLETED' && signalData.result === 'LOSS' && (
                        <span className="text-red-400">❌ LOSS</span>
                      )}
                      {signalData.lifecycleStatus === 'EXPIRED' && (
                        <span className="dark:text-gray-400 light:text-slate-500">⏳ EXPIRED</span>
                      )}
                      {signalData.lifecycleStatus === 'ACTIVE' && (
                        <span className="text-primary">🟢 ACTIVE</span>
                      )}
                      {signalData.lifecycleStatus === 'PENDING' && (
                        <span className="text-amber-400">🔶 PENDING</span>
                      )}
                    </span>
                  </div>

                  {/* Close Reason */}
                  {signalData.se_close_reason && (
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">Close Reason</span>
                      <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${signalData.se_close_reason === 'TP3' ? 'bg-emerald-500/15 text-emerald-400' :
                        signalData.se_close_reason === 'TP2' ? 'bg-emerald-500/15 text-emerald-400' :
                          signalData.se_close_reason === 'TP1' ? 'bg-amber-500/15 text-amber-400' :
                            signalData.se_close_reason === 'SL' ? 'bg-red-500/15 text-red-400' :
                              signalData.se_close_reason === 'OPPOSITE_REV' ? 'bg-blue-500/15 text-blue-400' :
                                'bg-gray-500/15 dark:text-gray-400 light:text-slate-500'
                        }`}>
                        {signalData.se_close_reason === 'OPPOSITE_REV' ? 'OPP REV' : signalData.se_close_reason}
                      </span>
                    </div>
                  )}

                  <div className="h-px dark:bg-white/5 light:bg-green-200/30 my-1"></div>

                  {/* SE Targets — v3 (3 TP levels) */}
                  {(signalData.entry_price != null || signalData.se_entry_zone != null) && (
                    <>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">Entry Zone</span>
                        <span className="font-mono dark:text-white light:text-text-dark font-bold tracking-tight">
                          {formatPrice(signalData.entry_price ?? signalData.se_entry_zone ?? 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">Stop Loss</span>
                        <span className="font-mono text-red-400 font-bold tracking-tight">
                          {formatPrice(signalData.current_sl_price ?? signalData.se_current_sl ?? signalData.sl_price ?? signalData.se_sl ?? 0)}
                          {signalData.tp1_hit && (
                            <span className="ml-1 text-[9px] text-amber-400">(BE)</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">TP1 (1.5R)</span>
                        <span className="font-mono text-amber-400 font-bold tracking-tight">
                          {formatPrice(signalData.tp1_price ?? signalData.se_tp1 ?? 0)}
                          {signalData.tp1_hit && <span className="ml-1 text-[9px]">✓</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">TP2 (2R)</span>
                        <span className="font-mono text-cyan-400 font-bold tracking-tight">
                          {formatPrice(signalData.tp2_price ?? signalData.se_tp2 ?? 0)}
                          {signalData.tp2_hit && <span className="ml-1 text-[9px]">✓</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">TP3 (3R)</span>
                        <span className="font-mono text-emerald-400 font-bold tracking-tight">
                          {formatPrice(signalData.tp3_price ?? 0)}
                          {signalData.tp3_hit && <span className="ml-1 text-[9px]">✓</span>}
                        </span>
                      </div>
                    </>
                  )}

                  {/* R:R Ratio */}
                  {(signalData.entry_price != null || signalData.se_entry_zone != null) && (signalData.tp3_price != null || signalData.se_tp2 != null) && (
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">Risk / Reward</span>
                      <span className="font-mono dark:text-white light:text-text-dark text-lg font-bold">1:1.5 / 1:2 / 1:3</span>
                    </div>
                  )}

                  {/* Candle Tracking Progress */}
                  {signalData.candles_tracked != null && signalData.max_candles != null && (
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="flex justify-between text-xs font-medium dark:text-gray-400 light:text-text-light-secondary">
                        <span>Candles Tracked</span>
                        <span className="text-primary font-mono">{signalData.candles_tracked} / {signalData.max_candles}</span>
                      </div>
                      <div className="w-full h-2 dark:bg-white/5 light:bg-green-100/50 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${(signalData.candles_tracked / signalData.max_candles) > 0.8
                            ? 'bg-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                            : 'bg-primary shadow-[0_0_10px_rgba(19,236,55,0.4)]'
                            }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((signalData.candles_tracked / signalData.max_candles) * 100, 100)}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Close Price */}
                  {signalData.se_close_price != null && (
                    <div className="mt-auto pt-4 dark:border-t-white/5 light:border-t-green-200/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">Closed At</span>
                        <span className="font-mono dark:text-white light:text-text-dark font-bold">{formatPrice(signalData.se_close_price)}</span>
                      </div>
                      {signalData.pnlPercent != null && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm dark:text-gray-400 light:text-text-light-secondary font-medium">PnL</span>
                          <span className={`font-mono font-bold ${signalData.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {signalData.pnlPercent >= 0 ? '+' : ''}{signalData.pnlPercent.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Risk Warning - only for ACTIVE/PENDING */}
                  {(signalData.lifecycleStatus === 'ACTIVE' || signalData.lifecycleStatus === 'PENDING') && (
                    <div className="mt-auto pt-4 dark:border-t-white/5 light:border-t-green-200/30">
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="p-3 rounded-lg dark:bg-red-500/10 light:bg-red-100/50 border dark:border-red-500/20 light:border-red-200/50 flex items-start gap-3"
                      >
                        <span className="material-symbols-outlined text-red-500 text-lg mt-0.5">warning</span>
                        <div>
                          <span className="text-xs font-bold text-red-400 uppercase block mb-1">Risk Warning</span>
                          <p className="text-[10px] dark:text-gray-400 light:text-text-light-secondary leading-relaxed">
                            Signal is being tracked. SL at {formatPrice(signalData.se_current_sl ?? signalData.se_sl ?? 0)}.
                            {signalData.se_r_ratio_hit ? ' Breakeven activated.' : ''}
                          </p>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
