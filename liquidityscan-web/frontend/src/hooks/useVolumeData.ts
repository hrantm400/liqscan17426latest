import { useQuery } from '@tanstack/react-query';

export interface SymbolVolume {
    symbol: string;
    quoteVolume: number; // 24h volume in USDT
}

const LOW_VOLUME_THRESHOLD = 20_000_000; // $20M

/**
 * Fetch 24h volume data for all USDT pairs from Binance.
 * Uses the public /fapi/v1/ticker/24hr endpoint.
 * Cached for 5 minutes.
 */
async function fetchAllVolumes(): Promise<Map<string, number>> {
    try {
        const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
        if (!res.ok) return new Map();
        const data: Array<{ symbol: string; quoteVolume: string }> = await res.json();
        const map = new Map<string, number>();
        for (const t of data) {
            map.set(t.symbol, parseFloat(t.quoteVolume) || 0);
        }
        return map;
    } catch {
        return new Map();
    }
}

/**
 * React hook: provides volume data for filtering signals.
 * Returns { volumeMap, getVolume, isLowVolume, isLoading }
 */
export function useVolumeData() {
    const { data: volumeMap = new Map<string, number>(), isLoading } = useQuery({
        queryKey: ['binance-volumes'],
        queryFn: fetchAllVolumes,
        staleTime: 5 * 60 * 1000,    // 5 min
        refetchInterval: 5 * 60 * 1000,
    });

    const getVolume = (symbol: string): number => {
        return volumeMap.get(symbol) || 0;
    };

    const isLowVolume = (symbol: string): boolean => {
        return getVolume(symbol) < LOW_VOLUME_THRESHOLD;
    };

    const formatVolume = (vol: number): string => {
        if (vol >= 1e9) return `$${(vol / 1e9).toFixed(1)}B`;
        if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
        if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`;
        return `$${vol.toFixed(0)}`;
    };

    return { volumeMap, getVolume, isLowVolume, formatVolume, isLoading };
}
