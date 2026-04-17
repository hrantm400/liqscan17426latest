import { useQuery } from '@tanstack/react-query';

export interface CoinMarketData {
    id: string;
    symbol: string;
    name: string;
    market_cap_rank: number;
}

export interface MarketCapQueryResult {
    map: Map<string, number>;
    topCoins: CoinMarketData[];
}

/**
 * Fetch top 300 coins market cap data from our secure CoinMarketCap backend proxy.
 * Returns a map of symbol (uppercase, e.g., 'BTC') to market cap rank, plus top N slice for UI lists.
 */
async function fetchMarketCapRanks(): Promise<MarketCapQueryResult> {
    try {
        const apiUrl = import.meta.env.VITE_API_URL || 'https://liquidityscan.io/api';
        const res = await fetch(`${apiUrl}/cmc/ranks`);
        if (!res.ok) return { map: new Map(), topCoins: [] };
        const data: CoinMarketData[] = await res.json();

        const map = new Map<string, number>();
        for (const coin of data) {
            map.set(coin.symbol.toUpperCase(), coin.market_cap_rank);
        }
        return {
            map,
            topCoins: data.slice(0, 50),
        };
    } catch {
        return { map: new Map(), topCoins: [] };
    }
}

/**
 * React hook: provides market cap ranking data.
 * Returns { marketCapMap, getRank, topCoins, isLoading }
 */
export function useMarketCapData() {
    const { data, isLoading } = useQuery({
        queryKey: ['coingecko-market-caps'],
        queryFn: fetchMarketCapRanks,
        staleTime: 15 * 60 * 1000, // 15 min cache
        refetchInterval: 15 * 60 * 1000,
    });

    const marketCapMap = data?.map ?? new Map<string, number>();
    const topCoins = data?.topCoins ?? [];

    const getRank = (symbol: string): number | null => {
        let baseSymbol = symbol.replace('USDT', '').replace('_PERP', '').replace('PERP', '');
        return marketCapMap.get(baseSymbol) || null;
    };

    return { marketCapMap, getRank, topCoins, isLoading };
}
