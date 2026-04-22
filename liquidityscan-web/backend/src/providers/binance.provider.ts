import { Logger } from '@nestjs/common';
import { IExchangeProvider, IKline, ITicker24h } from './data-provider.interface';

/**
 * Async-safe rate limiter per API key.
 *
 * All requests for a key go through a FIFO queue.
 * Before each request the queue runner:
 *   1. Resets the bucket if the window has elapsed.
 *   2. If adding the request weight would exceed the budget,
 *      waits until the window resets.
 *   3. Reserves the weight BEFORE returning (no race).
 *
 * This completely eliminates the race condition where N concurrent
 * calls all check weight, all pass, and then all record — overshooting.
 */
interface RateLimitBucket {
    usedWeight: number;
    windowStart: number;
}

type QueueEntry = {
    weight: number;
    resolve: () => void;
};

export class BinanceProvider implements IExchangeProvider {
    private readonly logger = new Logger(BinanceProvider.name);

    private apiKeys: string[] = [];
    private currentKeyIndex = 0;

    // Binance Futures rate limit: 2400 weight / minute / IP+key
    // Budget 2000 per key (~83%), leaving 400 headroom
    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly MAX_WEIGHT_PER_MINUTE = 2000;
    private readonly KLINE_REQUEST_WEIGHT = 5;  // klines with limit <= 500 is weight 5

    private rateLimitBuckets: Map<string, RateLimitBucket> = new Map();

    // FIFO queues for each API key — ONE request at a time per key
    private queues: Map<string, QueueEntry[]> = new Map();
    private processing: Map<string, boolean> = new Map();

    constructor() {
        for (let i = 1; i <= 10; i++) {
            const key = process.env[`BINANCE_API_KEY_${i}`];
            if (key && key.length > 10 && !this.apiKeys.includes(key)) {
                this.apiKeys.push(key);
            }
        }

        if (this.apiKeys.length === 0) {
            this.logger.warn('No Binance API keys configured - using IP-based rate limiting (lower limits)');
            this.apiKeys.push('__NO_KEY__');
        } else {
            this.logger.log(`Binance provider initialized with ${this.apiKeys.length} API key(s), budget ${this.MAX_WEIGHT_PER_MINUTE} weight/min/key`);
        }

        for (const key of this.apiKeys) {
            this.rateLimitBuckets.set(key, { usedWeight: 0, windowStart: Date.now() });
            this.queues.set(key, []);
            this.processing.set(key, false);
        }
    }

    /**
     * Round-robin key selection.
     * Picks the key with the LOWEST current weight to better distribute load.
     */
    private getNextApiKey(): string {
        if (this.apiKeys.length === 1) return this.apiKeys[0];

        // Smart selection: pick the key with the lowest current weight
        let bestKey = this.apiKeys[0];
        let bestWeight = Infinity;

        for (const key of this.apiKeys) {
            const bucket = this.rateLimitBuckets.get(key);
            if (!bucket) continue;

            // Reset if window elapsed
            const now = Date.now();
            if (now - bucket.windowStart >= this.RATE_LIMIT_WINDOW_MS) {
                bucket.usedWeight = 0;
                bucket.windowStart = now;
            }

            if (bucket.usedWeight < bestWeight) {
                bestWeight = bucket.usedWeight;
                bestKey = key;
            }
        }

        return bestKey;
    }

    /**
     * Queue-based rate limiter. Returns a promise that resolves only when
     * it is safe to make the request. Weight is reserved BEFORE resolving.
     */
    private acquireRateSlot(apiKey: string, weight: number): Promise<void> {
        return new Promise<void>((resolve) => {
            const queue = this.queues.get(apiKey)!;
            queue.push({ weight, resolve });
            this.processQueue(apiKey);
        });
    }

    private async processQueue(apiKey: string): Promise<void> {
        if (this.processing.get(apiKey)) return;
        this.processing.set(apiKey, true);

        const queue = this.queues.get(apiKey)!;
        const bucket = this.rateLimitBuckets.get(apiKey)!;

        while (queue.length > 0) {
            const entry = queue[0];

            // Reset window if elapsed
            const now = Date.now();
            if (now - bucket.windowStart >= this.RATE_LIMIT_WINDOW_MS) {
                bucket.usedWeight = 0;
                bucket.windowStart = now;
            }

            // Check if we have budget
            if (bucket.usedWeight + entry.weight > this.MAX_WEIGHT_PER_MINUTE) {
                const waitTime = this.RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart) + 200;
                this.logger.warn(
                    `Rate limit budget exhausted for key ${apiKey.slice(0, 8)}... ` +
                    `(${bucket.usedWeight}/${this.MAX_WEIGHT_PER_MINUTE}), waiting ${(waitTime / 1000).toFixed(1)}s`
                );
                await this.sleep(waitTime);
                // Reset after wait
                bucket.usedWeight = 0;
                bucket.windowStart = Date.now();
                continue; // Re-check
            }

            // Reserve weight and release
            bucket.usedWeight += entry.weight;
            queue.shift();
            entry.resolve();

            // Small delay between requests to avoid bursts
            if (queue.length > 0) {
                await this.sleep(50);
            }
        }

        this.processing.set(apiKey, false);
    }

    /**
     * Update our internal weight counter from Binance's actual header.
     * This self-corrects any drift between our estimate and reality.
     */
    private syncWeightFromHeader(apiKey: string, headerValue: string | null): void {
        if (!headerValue) return;
        const actualWeight = parseInt(headerValue, 10);
        if (isNaN(actualWeight)) return;

        const bucket = this.rateLimitBuckets.get(apiKey);
        if (bucket) {
            // Only sync upward — if Binance says we've used more, believe it
            if (actualWeight > bucket.usedWeight) {
                bucket.usedWeight = actualWeight;
            }
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
                // Wait for our queue-based rate limiter to give us a slot
                await this.acquireRateSlot(apiKey, this.KLINE_REQUEST_WEIGHT);

                const res = await fetch(url, {
                    headers: this.buildHeaders(apiKey),
                });

                // Sync our internal counter with Binance's actual count
                this.syncWeightFromHeader(apiKey, res.headers.get('X-MBX-USED-WEIGHT-1M'));

                if (res.ok) {
                    return res;
                }

                if (res.status === 429) {
                    const retryAfter = res.headers.get('Retry-After');
                    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 10_000;
                    this.logger.warn(`HTTP 429 rate limited on key ${apiKey.slice(0, 8)}..., waiting ${(waitMs / 1000).toFixed(0)}s before retry ${attempt + 1}/${maxRetries}`);

                    // Force-reset the bucket — we're obviously over limit
                    const bucket = this.rateLimitBuckets.get(apiKey);
                    if (bucket) {
                        bucket.usedWeight = this.MAX_WEIGHT_PER_MINUTE; // Block further requests
                    }

                    if (attempt < maxRetries) {
                        await this.sleep(waitMs);
                        // Reset after waiting
                        if (bucket) {
                            bucket.usedWeight = 0;
                            bucket.windowStart = Date.now();
                        }
                        continue;
                    }
                }

                if (res.status === 418) {
                    this.logger.error(`HTTP 418 IP banned temporarily on key ${apiKey.slice(0, 8)}..., waiting 120s`);

                    if (attempt < maxRetries) {
                        await this.sleep(120_000);
                        continue;
                    }
                }

                return res;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                this.logger.warn(`Fetch error on key ${apiKey.slice(0, 8)}... (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}`);

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

    async get24hVolumes(): Promise<Map<string, number>> {
        const map = new Map<string, number>();
        try {
            const apiKey = this.getNextApiKey();
            const res = await this.fetchWithRetry(
                'https://fapi.binance.com/fapi/v1/ticker/24hr',
                apiKey,
                1,
            );

            if (!res.ok) {
                this.logger.error(`Binance 24hr ticker API returned ${res.status}`);
                return map;
            }

            const tickers = await res.json();
            for (const t of tickers) {
                // Use quoteVolume for USDT volume
                map.set(t.symbol, parseFloat(t.quoteVolume));
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to fetch Binance 24h volumes: ${msg}`);
        }
        return map;
    }

    async get24hTickers(): Promise<Map<string, ITicker24h>> {
        const map = new Map<string, ITicker24h>();
        try {
            const apiKey = this.getNextApiKey();
            const res = await this.fetchWithRetry(
                'https://fapi.binance.com/fapi/v1/ticker/24hr',
                apiKey,
                1,
            );

            if (!res.ok) {
                this.logger.error(`Binance 24hr ticker API returned ${res.status}`);
                return map;
            }

            const tickers = await res.json();
            for (const t of tickers) {
                const price = parseFloat(t.lastPrice);
                const change24h = parseFloat(t.priceChangePercent);
                if (!Number.isFinite(price) || !Number.isFinite(change24h)) continue;
                map.set(t.symbol, { price, change24h });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to fetch Binance 24h tickers: ${msg}`);
        }
        return map;
    }
}
