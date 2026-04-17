import { useQuery } from '@tanstack/react-query';
import { Signal, StrategyType } from '../types';
import { fetchSignals } from '../services/signalsApi';

interface UseMarketDataOptions {
  strategyType: StrategyType;
  timeframe?: string;
  limit?: number;
  minVolume?: number;
  refetchInterval?: number;
}

export const useMarketData = (options: UseMarketDataOptions) => {
  const { strategyType, timeframe, limit = 1000, minVolume, refetchInterval = 60000 } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['signals', strategyType, timeframe, limit, minVolume],
    queryFn: () => fetchSignals(strategyType, limit, minVolume),
    refetchInterval,
    placeholderData: (prev) => prev,
  });

  const signals: Signal[] = Array.isArray(data) ? data : [];

  return {
    signals,
    isLoading,
    error,
    refetch,
  };
};
