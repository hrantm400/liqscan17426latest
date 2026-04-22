export interface IKline {
    openTime: number; // Milliseconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface IExchangeProvider {
    /** Gets exactly the array of trading pairs (e.g., BTCUSDT) */
    fetchSymbols(): Promise<string[]>;

    /** Gets historic candles. Limit is usually up to 500. */
    getKlines(symbol: string, interval: string, limit: number): Promise<IKline[]>;

    /** Gets a live map of prices for determining SL/TP execution */
    getCurrentPrices(): Promise<Map<string, number>>;

    /** Gets a live map of 24h quote volumes for filtering out illiquid pairs */
    get24hVolumes(): Promise<Map<string, number>>;

    /**
     * Gets a live map of 24h tickers combining last price and percent change.
     * Single upstream call returns all trading symbols in one response; the
     * caller typically stashes the result in an in-memory TTL cache.
     */
    get24hTickers(): Promise<Map<string, ITicker24h>>;
}

export interface ITicker24h {
    /** Last traded price from the exchange's 24h ticker snapshot. */
    price: number;
    /** Rolling 24h price-change percent (already expressed in %, e.g. 1.23 for +1.23%). */
    change24h: number;
}
