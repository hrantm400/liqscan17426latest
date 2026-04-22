import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  fetchCoreLayerSignalById,
  fetchCoreLayerSignals,
  fetchCoreLayerStats,
  type CoreLayerListFilters,
  type CoreLayerListResponse,
  type CoreLayerStatsResponse,
} from '../services/coreLayerApi';
import type { CoreLayerSignal, CoreLayerVariant } from '../core-layer/types';

/**
 * Core-Layer TanStack Query hooks — Phase 5.
 *
 * Usage pattern for pages:
 *   const { data: stats } = useCoreLayerStats();
 *   const enabled = stats?.enabled ?? false;
 *   // when !enabled → page falls back to mock data + shows "feature disabled" banner.
 *   // when enabled → live data flows through useCoreLayerSignals / useCoreLayerSignal.
 *
 * All queries follow the same `['core-layer', ...]` key prefix so the whole
 * feature can be invalidated with one `queryClient.invalidateQueries(['core-layer'])`
 * call (e.g. after a manual "Refresh" tap).
 *
 * Refetch cadence: 60s. Core-Layer is driven by the hourly scanner (ADR D3);
 * anything faster is wasted. Stats also refresh at 60s so the `enabled`
 * flag flip is picked up within the next minute without a page reload.
 */

const CORE_LAYER_REFETCH_MS = 60_000;

const CORE_LAYER_KEYS = {
  stats: () => ['core-layer', 'stats'] as const,
  list: (filters: CoreLayerListFilters) => ['core-layer', 'list', filters] as const,
  signal: (id: string) => ['core-layer', 'signal', id] as const,
  signalByPair: (variant: CoreLayerVariant, pair: string) =>
    ['core-layer', 'pair', variant, pair] as const,
};

export function useCoreLayerStats() {
  return useQuery<CoreLayerStatsResponse>({
    queryKey: CORE_LAYER_KEYS.stats(),
    queryFn: fetchCoreLayerStats,
    refetchInterval: CORE_LAYER_REFETCH_MS,
    placeholderData: (prev) => prev,
  });
}

export function useCoreLayerSignals(filters: CoreLayerListFilters = {}) {
  return useQuery<CoreLayerListResponse>({
    queryKey: CORE_LAYER_KEYS.list(filters),
    queryFn: () => fetchCoreLayerSignals(filters),
    refetchInterval: CORE_LAYER_REFETCH_MS,
    placeholderData: (prev) => prev,
  });
}

export function useCoreLayerSignalsInfinite(filters: Omit<CoreLayerListFilters, 'cursor'> = {}) {
  return useInfiniteQuery<CoreLayerListResponse>({
    queryKey: CORE_LAYER_KEYS.list({ ...filters, cursor: '__infinite__' }),
    queryFn: ({ pageParam }) =>
      fetchCoreLayerSignals({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: CORE_LAYER_REFETCH_MS,
  });
}

export function useCoreLayerSignal(id: string | undefined) {
  return useQuery<CoreLayerSignal | null>({
    queryKey: CORE_LAYER_KEYS.signal(id ?? ''),
    queryFn: () => (id ? fetchCoreLayerSignalById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
    refetchInterval: CORE_LAYER_REFETCH_MS,
    placeholderData: (prev) => prev,
  });
}

/**
 * Resolve `/core-layer/:variant/:pair` → stable signal id via the list endpoint.
 * Uses the `pair` filter added alongside this hook. Returns the first match
 * across ACTIVE then CLOSED status (ACTIVE preferred when both exist, which
 * is the normal lifecycle).
 */
export function useCoreLayerSignalByPair(
  variant: CoreLayerVariant | undefined,
  pair: string | undefined,
) {
  return useQuery<CoreLayerSignal | null>({
    queryKey: CORE_LAYER_KEYS.signalByPair(variant ?? 'SE', pair ?? ''),
    queryFn: async () => {
      if (!variant || !pair) return null;
      // Prefer ACTIVE; fall back to CLOSED so historical pairs remain navigable.
      const active = await fetchCoreLayerSignals({ variant, pair, status: 'ACTIVE', limit: 1 });
      if (active.signals[0]) return active.signals[0];
      const closed = await fetchCoreLayerSignals({ variant, pair, status: 'CLOSED', limit: 1 });
      return closed.signals[0] ?? null;
    },
    enabled: Boolean(variant && pair),
    refetchInterval: CORE_LAYER_REFETCH_MS,
    placeholderData: (prev) => prev,
  });
}
