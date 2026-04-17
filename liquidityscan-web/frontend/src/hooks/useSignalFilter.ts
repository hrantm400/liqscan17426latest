import { useMemo } from 'react';
import { Signal, Timeframe, StrategyType } from '../types';

interface UseSignalFilterOptions {
  signals: Signal[];
  searchQuery: string;
  activeTimeframe?: Timeframe | 'all';
  bullFilter: string;
  bearFilter: string;
  directionFilter?: 'All' | 'Longs' | 'Shorts';
  sortBy: 'time' | 'symbol';
  marketCapSort: 'high-low' | 'low-high' | null;
  volumeSort: 'high-low' | 'low-high' | null;
  rankingFilter: number | null;
  showClosedSignals: boolean;
  strategyType: StrategyType;
  volumeMap?: Map<string, number>;
  marketCapMap?: Map<string, number>;
}

export const useSignalFilter = (options: UseSignalFilterOptions) => {
  const {
    signals,
    searchQuery,
    activeTimeframe,
    bullFilter,
    bearFilter,
    directionFilter,
    sortBy,
    marketCapSort,
    volumeSort,
    rankingFilter,
    showClosedSignals,
    strategyType,
    volumeMap,
    marketCapMap,
  } = options;

  const filteredSignals = useMemo(() => {
    let filtered = [...signals];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (signal) =>
          signal.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          signal.symbol.toUpperCase().includes(searchQuery.toUpperCase())
      );
    }

    // Timeframe filter
    if (activeTimeframe && activeTimeframe !== 'all') {
      filtered = filtered.filter((signal) => signal.timeframe === activeTimeframe);
    }

    // Strategy-specific Bull/Bear filters
    if (strategyType === 'SUPER_ENGULFING') {
      if (bullFilter !== 'All' && bullFilter !== '') {
        filtered = filtered.filter((signal) => {
          if (signal.signalType === 'BUY') {
            const pattern = signal.metadata?.pattern || 'RUN';
            if (bullFilter === 'Run') return pattern === 'RUN';
            if (bullFilter === 'Run+') return pattern === 'RUN_PLUS';
            if (bullFilter === 'Rev') return pattern === 'REV';
            if (bullFilter === 'Rev+') return pattern === 'REV_PLUS';
            return true;
          }
          return false;
        });
      }

      if (bearFilter !== 'All' && bearFilter !== '') {
        filtered = filtered.filter((signal) => {
          if (signal.signalType === 'SELL') {
            const pattern = signal.metadata?.pattern || 'RUN';
            if (bearFilter === 'Run') return pattern === 'RUN';
            if (bearFilter === 'Run+') return pattern === 'RUN_PLUS';
            if (bearFilter === 'Rev') return pattern === 'REV';
            if (bearFilter === 'Rev+') return pattern === 'REV_PLUS';
            return true;
          }
          return false;
        });
      }
    } else if (strategyType === 'ICT_BIAS') {
      // ICT Bias filters: All | Long | Short
      if (bullFilter !== 'All' && bullFilter !== '') {
        filtered = filtered.filter((signal) => {
          const metadata = signal.metadata as any;
          const bias = metadata?.bias || signal.signalType;
          if (bullFilter === 'Long') return bias === 'BULLISH' || bias === 'BUY';
          if (bullFilter === 'Short') return bias === 'BEARISH' || bias === 'SELL';
          return true;
        });
      }

      if (bearFilter !== 'All' && bearFilter !== '') {
        filtered = filtered.filter((signal) => {
          const metadata = signal.metadata as any;
          const bias = metadata?.bias || signal.signalType;
          if (bearFilter === 'Long') return bias === 'BULLISH' || bias === 'BUY';
          if (bearFilter === 'Short') return bias === 'BEARISH' || bias === 'SELL';
          return true;
        });
      }
    }

    // Direction filter
    if (directionFilter === 'Longs') {
      filtered = filtered.filter((signal) => {
        const bias = (signal.metadata as any)?.bias || signal.signalType;
        return bias === 'BULLISH' || bias === 'BUY';
      });
    } else if (directionFilter === 'Shorts') {
      filtered = filtered.filter((signal) => {
        const bias = (signal.metadata as any)?.bias || signal.signalType;
        return bias === 'BEARISH' || bias === 'SELL';
      });
    }

    const symRank = (s: Signal) => {
      const base = s.symbol.replace('USDT', '').replace('_PERP', '').replace('PERP', '');
      return marketCapMap?.get(base) ?? 999999;
    };
    const symVol = (s: Signal) => volumeMap?.get(s.symbol) ?? 0;

    const rankCmp = (a: Signal, b: Signal) => {
      if (!marketCapSort || !marketCapMap || marketCapMap.size === 0) return 0;
      let cmp = symRank(a) - symRank(b);
      if (marketCapSort === 'low-high') cmp = -cmp;
      return cmp;
    };
    const volCmp = (a: Signal, b: Signal) => {
      if (!volumeSort || !volumeMap || volumeMap.size === 0) return 0;
      const volA = symVol(a);
      const volB = symVol(b);
      return volumeSort === 'high-low' ? volB - volA : volA - volB;
    };

    // When user picks CMC / volume sort (table header or filter menu), that order is primary — not a tie-breaker after time
    filtered.sort((a, b) => {
      let cmp = 0;
      if (marketCapSort && marketCapMap && marketCapMap.size > 0) {
        cmp = rankCmp(a, b);
        if (cmp !== 0) return cmp;
        if (volumeSort && volumeMap && volumeMap.size > 0) {
          cmp = volCmp(a, b);
          if (cmp !== 0) return cmp;
        }
      } else if (volumeSort && volumeMap && volumeMap.size > 0) {
        cmp = volCmp(a, b);
        if (cmp !== 0) return cmp;
      }

      if (sortBy === 'time') {
        return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
      }
      return a.symbol.localeCompare(b.symbol);
    });

    // Hard filter: always hide coins with <$20M 24h volume
    if (volumeMap && volumeMap.size > 0) {
      filtered = filtered.filter(s => {
        const vol = volumeMap.get(s.symbol) || 0;
        return vol >= 20_000_000;
      });
    }

    // Ranking filter — filter by actual CMC rank, not just first N items
    if (rankingFilter && marketCapMap && marketCapMap.size > 0) {
      filtered = filtered.filter(s => {
        const base = s.symbol.replace('USDT', '').replace('_PERP', '').replace('PERP', '');
        const rank = marketCapMap.get(base);
        return rank != null && rank <= rankingFilter;
      });
    }

    // Status filter — use lifecycleStatus for SE lifecycle
    if (!showClosedSignals) {
      filtered = filtered.filter((signal) =>
        signal.lifecycleStatus === 'PENDING' || signal.lifecycleStatus === 'ACTIVE'
      );
    }

    return filtered;
  }, [
    signals,
    searchQuery,
    activeTimeframe,
    bullFilter,
    bearFilter,
    directionFilter,
    sortBy,
    marketCapSort,
    volumeSort,
    rankingFilter,
    showClosedSignals,
    strategyType,
    volumeMap,
    marketCapMap,
  ]);

  return filteredSignals;
};
