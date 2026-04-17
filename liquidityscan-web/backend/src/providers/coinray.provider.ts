import { Logger } from '@nestjs/common';
import { IExchangeProvider, IKline } from './data-provider.interface';

export class CoinrayProvider implements IExchangeProvider {
    private readonly logger = new Logger(CoinrayProvider.name);
    private readonly baseUrl = 'https://api.coinray.eu';

    private getHeaders() {
        const apiKey = process.env.COINRAY_API_KEY;
        if (!apiKey) {
            this.logger.error('COINRAY_API_KEY is not set in environment variables.');
        }
        return {
            accept: 'application/json',
            authorization: `Bearer ${apiKey}`,
        };
    }

    async fetchSymbols(): Promise<string[]> {
        try {
            const res = await fetch(`${this.baseUrl}/api/v1/markets?exchange=BIFU`, { headers: this.getHeaders() });
            if (!res.ok) throw new Error(`Coinray exchange API returned ${res.statusText}`);
            const data = await res.json();

            // Map BIFU_USDT_BTC to BTCUSDT
            const symbols = (data.markets as any[])
                .filter((s) => s.enabled === true && s.quoteCurrency === 'USDT')
                .map((s) => s.symbol); // e.g. "MASKUSDT"

            return symbols;
        } catch (error) {
            this.logger.error(`Error fetching symbols from Coinray: ${error.message}`);
            return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
        }
    }

    private convertInterval(interval: string): string {
        const mapping: Record<string, string> = {
            '1m': '1',
            '5m': '5',
            '15m': '15',
            '30m': '30',
            '1h': '60',
            '4h': '240',
            '1d': 'D',
            '1w': 'W'
        };
        return mapping[interval] || '60';
    }

    async getKlines(symbol: string, interval: string, limit: number): Promise<IKline[]> {
        // We must map BTCUSDT back to BIFU_USDT_BTC for their candles API
        const base = symbol.replace('USDT', '');
        const coinraySymbol = `BIFU_USDT_${base}`;
        const resolution = this.convertInterval(interval);

        const url = `${this.baseUrl}/api/v2/candles/open?symbol=${coinraySymbol}&resolution=${resolution}`;
        const res = await fetch(url, { headers: this.getHeaders() });
        if (!res.ok) {
            throw new Error(`Coinray HTTP ${res.status} for ${coinraySymbol} on ${resolution}`);
        }

        const data = await res.json();
        const candlesArr = data.candles as any[];

        // Take only the requested limit (slice from the end)
        const sliced = candlesArr.slice(-limit);

        return sliced.map((d: any[]) => ({
            openTime: d[0] * 1000, // Convert seconds to ms
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
        }));
    }

    async getCurrentPrices(): Promise<Map<string, number>> {
        const map = new Map<string, number>();
        try {
            // Coinray doesn't seem to have a simple `ticker/price` endpoint from the docs.
            // But we can get the latest prices from the markets endpoint!
            const res = await fetch(`${this.baseUrl}/api/v1/markets?exchange=BIFU`, { headers: this.getHeaders() });
            if (!res.ok) {
                this.logger.error(`Coinray markets API returned ${res.status}`);
                return map;
            }
            const data = await res.json();
            for (const market of data.markets) {
                if (market.closePrice) {
                    map.set(market.symbol, parseFloat(market.closePrice));
                } else if (market.lastPrice) { // In case it's called lastPrice
                    map.set(market.symbol, parseFloat(market.lastPrice));
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to fetch Coinray prices: ${msg}`);
        }
        return map;
    }

    async get24hVolumes(): Promise<Map<string, number>> {
        // Fallback for Coinray; currently Binance is the active provider.
        return new Map<string, number>();
    }
}
