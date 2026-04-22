import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { BinanceProvider } from '../providers/binance.provider';
import type { IExchangeProvider, ITicker24h } from '../providers/data-provider.interface';

/**
 * In-memory 24h ticker cache — Phase 5.1 (ticker enrichment).
 *
 * Polls Binance /fapi/v1/ticker/24hr every 30 seconds via the existing
 * `BinanceProvider` (same rate limiter, same API-key rotation, same retry
 * logic), stores the snapshot in a `Map<symbol, { price, change24h }>`,
 * and exposes a sync `.get(symbol)` for read-time enrichment from
 * `CoreLayerQueryService.toDto()`.
 *
 * Design notes:
 *   - Read-time enrichment (not write-time). No DB schema changes, no
 *     detection/lifecycle changes. Rollback is a pure `git revert`.
 *   - One upstream request every 30s returns ~600 symbols. Binance weight
 *     budget: 80/min vs 1200 limit → 15× headroom.
 *   - On refresh failure: keep the previous snapshot, capture via Sentry
 *     with `service: ticker-cache` tag, log a warn. Callers never see
 *     exceptions — `.get()` returns `null` on miss and the query service
 *     falls back to the 0/0 placeholder (→ frontend renders `—`).
 *   - Not gated by a feature flag (per plan): always-on. If we ever need
 *     an off-switch, add `TICKER_ENRICHMENT_ENABLED` analogous to
 *     CORE_LAYER_ENABLED.
 */

const REFRESH_CRON = '*/30 * * * * *';

@Injectable()
export class TickerCacheService implements OnModuleInit {
    private readonly logger = new Logger(TickerCacheService.name);
    // Instantiated the same way CandlesService does — matches the existing
    // pattern in this codebase where BinanceProvider is not a Nest provider.
    private readonly provider: IExchangeProvider;
    private cache: Map<string, ITicker24h> = new Map();
    private lastRefreshAt: number | null = null;
    private inFlight = false;

    constructor(@Optional() provider?: IExchangeProvider) {
        // @Optional because this is an interface-only dep (erases to Object at
        // runtime) with no registered provider — Nest would otherwise fail DI
        // resolution at boot. Constructor override is purely for tests; the
        // prod flow falls through to a fresh BinanceProvider instance,
        // mirroring the existing pattern in CandlesService.
        this.provider = provider ?? new BinanceProvider();
    }

    async onModuleInit(): Promise<void> {
        // Seed the cache once at startup so the very first /core-layer read
        // after a restart already has prices. A failure here must not block
        // boot — the @Cron will retry in 30s.
        await this.refresh();
    }

    @Cron(REFRESH_CRON)
    async scheduledRefresh(): Promise<void> {
        await this.refresh();
    }

    /**
     * Lookup a single symbol. Returns `null` when the symbol is absent from
     * the latest snapshot (e.g. pair not listed on Binance Futures, or the
     * cache has never successfully refreshed).
     */
    get(symbol: string): ITicker24h | null {
        return this.cache.get(symbol) ?? null;
    }

    /** Test / diagnostics hook — snapshot age in ms, or null when never refreshed. */
    ageMs(now: number = Date.now()): number | null {
        return this.lastRefreshAt == null ? null : now - this.lastRefreshAt;
    }

    /** Test / diagnostics hook — number of symbols currently cached. */
    size(): number {
        return this.cache.size;
    }

    async refresh(): Promise<void> {
        if (this.inFlight) {
            // Overlap guard — if a previous refresh is still in flight (network
            // slow, rate limiter queued), skip this tick rather than stacking
            // duplicate calls on the BinanceProvider queue.
            return;
        }
        this.inFlight = true;
        const startedAt = Date.now();
        try {
            const fresh = await this.provider.get24hTickers();
            if (fresh.size === 0) {
                // Upstream returned empty — likely a transient error. Keep the
                // previous snapshot so downstream reads still enrich cleanly
                // until the next tick.
                this.logger.warn(
                    'TickerCacheService: upstream returned 0 symbols; keeping previous snapshot',
                );
                return;
            }
            this.cache = fresh;
            this.lastRefreshAt = Date.now();
            this.logger.log(
                `TickerCacheService: refreshed ${fresh.size} symbols in ${Date.now() - startedAt}ms`,
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`TickerCacheService refresh failed: ${msg}`);
            Sentry.withScope((scope) => {
                scope.setTag('service', 'ticker-cache');
                scope.setLevel('warning');
                Sentry.captureException(err);
            });
        } finally {
            this.inFlight = false;
        }
    }
}
