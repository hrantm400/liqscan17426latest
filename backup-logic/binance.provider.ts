import { Logger } from '@nestjs/common';
import { IExchangeProvider, IKline } from './data-provider.interface';

interface RateLimitBucket {
    usedWeight: number;
    windowStart: number;
}

export class BinanceProvider implements IExchangeProvider {
    private readonly logger = new Logger(BinanceProvider.name);

    private apiKeys: string[] = [];
    private currentKeyIndex = 0;

    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly MAX_WEIGHT_PER_MINUTE = 2400;
    private readonly KLINE_REQUEST_WEIGHT = 10;

    private rateLimitBuckets: Map<string, RateLimitBucket> = new Map();

    constructor() {
        const key1 = process.env.BINANCE_API_KEY_1;
        const key2 = process.env.BINANCE_API_KEY_2;

        if (key1 && key1.length > 10) {
            this.apiKeys.push(key1);
        }
        if (key2 && key2.length > 10 && key2 !== key1) {
            this.apiKeys.push(key2);
        }

        if (this.apiKeys.length === 0) {
            this.logger.warn('No Binance API keys configured - using IP-based rate limiting (lower limits)');
            this.apiKeys.push('__NO_KEY__');
        } else {
            this.logger.log(`Binance provider initialized with ${this.apiKeys.length} API key(s)`);
        }

        for (const key of this.apiKeys) {
            this.rateLimitBuckets.set(key, { usedWeight: 0, windowStart: Date.now() });
        }
    }

    private getNextApiKey(): string {
        const key = this.apiKeys[this.currentKeyIndex];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        return key;
    }

    private async waitForRateLimit(apiKey: string): Promise<void> {
        const bucket = this.rateLimitBuckets.get(apiKey);
        if (!bucket) return;

        const now = Date.now();
        const elapsed = now - bucket.windowStart;

        if (elapsed >= this.RATE_LIMIT_WINDOW_MS) {
            bucket.usedWeight = 0;
            bucket.windowStart = now;
            return;
        }

        if (bucket.usedWeight + this.KLINE_REQUEST_WEIGHT > this.MAX_WEIGHT_PER_MINUTE) {
            const waitTime = this.RATE_LIMIT_WINDOW_MS - elapsed + 100;
            this.logger.warn(`Rate limit approaching for key ${apiKey.slice(0, 8)}..., waiting ${waitTime}ms`);
            await this.sleep(waitTime);
            bucket.usedWeight = 0;
            bucket.windowStart = Date.now();
        }
    }

    private recordRequestWeight(apiKey: string, weight: number): void {
        const bucket = this.rateLimitBuckets.get(apiKey);
        if (bucket) {
            bucket.usedWeight += weight;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private buildHeaders(apiKey: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey !== '__NO_KEY__') {
            headers['X-MBX-APIKEY'] = apiKey;
        }
        return headers;
    }

    private async fetchWithRetry(
        url: string,
        apiKey: string,
        maxRetries = 2,
    ): Promise<Response> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await this.waitForRateLimit(apiKey);

                const res = await fetch(url, {
                    headers: this.buildHeaders(apiKey),
                });

                this.recordRequestWeight(apiKey, this.KLINE_REQUEST_WEIGHT);

                const weightHeader = res.headers.get('X-MBX-USED-WEIGHT-1M');
                if (weightHeader) {
                    const bucket = this.rateLimitBuckets.get(apiKey);
                    if (bucket) {
                        bucket.usedWeight = parseInt(weightHeader, 10) || bucket.usedWeight;
                    }
                }

                if (res.ok) {
                    return res;
                }

                if (res.status === 429) {
                    const retryAfter = res.headers.get('Retry-After');
                    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
                    this.logger.warn(`HTTP 429 rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);

                    if (attempt < maxRetries) {
                        await this.sleep(waitMs);
                        continue;
                    }
                }

                if (res.status === 418) {
                    this.logger.warn(`HTTP 418 IP banned temporarily, waiting 60s before retry ${attempt + 1}/${maxRetries}`);

                    if (attempt < maxRetries) {
                        await this.sleep(60_000);
                        continue;
                    }
                }

                return res;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                this.logger.warn(`Fetch error (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}`);

                if (attempt < maxRetries) {
                    const backoff = Math.pow(2, attempt) * 1000;
                    await this.sleep(backoff);
                }
            }
        }

        throw lastError || new Error('Fetch failed after retries');
    }

    async fetchSymbols(): Promise<string[]> {
        try {
            const apiKey = this.getNextApiKey();
            const res = await this.fetchWithRetry(
                'https://fapi.binance.com/fapi/v1/exchangeInfo',
                apiKey,
                1,
            );

            if (!res.ok) {
                throw new Error(`Failed to fetch exchange info: ${res.statusText}`);
            }

            const data = await res.json();
            const symbols = (data.symbols as any[])
                .filter((s) =>
                    s.status === 'TRADING' &&
                    s.quoteAsset === 'USDT' &&
                    (s.contractType === 'PERPETUAL' || s.contractType === 'TRADIFI_PERPETUAL') &&
                    s.symbol.length >= 5 &&
                    s.symbol !== 'USDT'
                )
                .map((s) => s.symbol);

            return symbols;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error fetching symbols from Binance: ${msg}`);
            return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
        }
    }

    async getKlines(symbol: string, interval: string, limit: number): Promise<IKline[]> {
        const apiKey = this.getNextApiKey();
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

        const res = await this.fetchWithRetry(url, apiKey, 2);

        if (!res.ok) {
            throw new Error(`Binance HTTP ${res.status} for ${symbol} on ${interval}`);
        }

        const data = await res.json();
        return data.map((d: any[]) => ({
            openTime: d[0],
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
            const apiKey = this.getNextApiKey();
            const res = await this.fetchWithRetry(
                'https://fapi.binance.com/fapi/v1/ticker/price',
                apiKey,
                1,
            );

            if (!res.ok) {
                this.logger.error(`Binance ticker API returned ${res.status}`);
                return map;
            }

            const tickers = await res.json();
            for (const t of tickers) {
                map.set(t.symbol, parseFloat(t.price));
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to fetch Binance prices: ${msg}`);
        }
        return map;
    }
}
