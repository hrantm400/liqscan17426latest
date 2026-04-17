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
}
