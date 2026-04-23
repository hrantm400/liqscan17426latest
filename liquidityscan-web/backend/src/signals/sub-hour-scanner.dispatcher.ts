import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { BinanceWsManager } from '../candles/binance-ws.manager';
import { CoreLayerDetectionService } from '../core-layer/core-layer.detection.service';
import { CoreLayerLifecycleService } from '../core-layer/core-layer.lifecycle.service';
import { CoreLayerRuntimeFlagService } from '../core-layer/core-layer.runtime-flag.service';
import { ScannerService } from './scanner.service';

/**
 * SubHourScannerDispatcher — Phase 7.3.
 *
 * Sits between BinanceWsManager (producer of 15m/5m kline-close events)
 * and the scanner + Core-Layer pipeline (consumer). Implements a
 * 30-second debounced batch so a burst of closes across many pairs
 * collapses into one scan+detection pass, trading ~30 s of freshness
 * for ~N× lower DB write amplification.
 *
 * Flow:
 *   1. On module init, subscribe to WS sub-hour close events if the
 *      Core-Layer master flag is on AND the sub-hour flag is on. Flag
 *      changes mid-process are picked up on the NEXT kline close —
 *      the subscription is established once; the debounce flush
 *      re-reads the flags before actually doing any work.
 *   2. Each kline close adds its pair to a Set<string>. If no flush is
 *      scheduled, schedule one 30 s out. Already-scheduled flushes
 *      coalesce additional dirty pairs.
 *   3. On flush: snapshot the dirty set, drain it, run per-pair
 *      scanner fan-out via ScannerService.scanSymbolSubHour, then
 *      CoreLayerDetectionService.runDetection({ pairs }) to fold the
 *      new upstream rows into Core-Layer chains.
 *
 * Design notes:
 *   - Master flag is rechecked at flush time (not just at subscribe
 *     time). Disabling Core-Layer entirely mid-batch is a clean
 *     no-op: we drain the set and skip the work.
 *   - If either scanner fan-out OR detection throws, telemetry
 *     records the failure. The next flush starts with a fresh (empty)
 *     dirty set — we do not retry, because the next kline close will
 *     re-dirty the same pairs anyway.
 *   - Concurrency: one flush in flight at a time. If a flush fires
 *     while another is still running, we reschedule (enqueue a fresh
 *     30 s timer); the second flush picks up whatever pairs were
 *     dirtied since the current one started.
 *   - The dispatcher does NOT interact with the hourly cron. The
 *     hourly path owns 1H/4H/1D/W + global lifecycle sweep; the
 *     dispatcher owns 15m/5m + per-pair detection. No shared
 *     mutable state beyond the DB.
 */
export const SUB_HOUR_FLUSH_DEBOUNCE_MS = 30_000;

@Injectable()
export class SubHourScannerDispatcher implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SubHourScannerDispatcher.name);
    private readonly dirtyPairs = new Set<string>();
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private unsubscribe: (() => void) | null = null;
    private flushing = false;

    constructor(
        private readonly ws: BinanceWsManager,
        private readonly scanner: ScannerService,
        private readonly coreLayerDetection: CoreLayerDetectionService,
        private readonly coreLayerLifecycle: CoreLayerLifecycleService,
        private readonly runtimeFlag: CoreLayerRuntimeFlagService,
    ) {}

    onModuleInit(): void {
        // Always subscribe. The listener short-circuits internally based on
        // the current flag state — this avoids a boot-time ordering issue
        // where the flag service's onModuleInit might run after this one
        // on some module graph permutations.
        this.unsubscribe = this.ws.onSubHourClose((evt) =>
            this.onSubHourClose(evt.symbol),
        );
        this.logger.log(
            `SubHourScannerDispatcher initialized (debounce=${SUB_HOUR_FLUSH_DEBOUNCE_MS}ms)`,
        );
    }

    onModuleDestroy(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }

    /**
     * Test hook: directly nudge the debounce machinery without running
     * a real WS event. Exposed as public-ish so the unit test can stay
     * at the API boundary instead of reaching into internals.
     */
    markDirtyForTesting(symbol: string): void {
        this.onSubHourClose(symbol);
    }

    flushNowForTesting(): Promise<void> {
        return this.flush();
    }

    getPendingPairCountForTesting(): number {
        return this.dirtyPairs.size;
    }

    private onSubHourClose(symbol: string): void {
        // Cheap fast-path: if either flag is off, don't even accumulate
        // dirty pairs. Saves the Set from growing unbounded if ops
        // disable sub-hour for hours and reconnects fire at full rate.
        if (!this.runtimeFlag.isEnabled() || !this.runtimeFlag.isSubHourEnabled()) {
            return;
        }
        this.dirtyPairs.add(symbol);
        this.scheduleFlush();
    }

    private scheduleFlush(): void {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flush().catch((err) => {
                this.logger.error(
                    `Sub-hour flush threw unexpectedly: ${(err as Error).message}`,
                );
            });
        }, SUB_HOUR_FLUSH_DEBOUNCE_MS);
    }

    private async flush(): Promise<void> {
        if (this.flushing) {
            // A previous flush is still running. Requeue so whatever new
            // pairs landed during the slow flush still get picked up.
            this.scheduleFlush();
            return;
        }
        // Recheck both flags at flush time. If either was turned off
        // between scheduling and firing, drain and exit cleanly.
        if (!this.runtimeFlag.isEnabled() || !this.runtimeFlag.isSubHourEnabled()) {
            this.dirtyPairs.clear();
            return;
        }
        if (this.dirtyPairs.size === 0) return;

        const pairs = Array.from(this.dirtyPairs);
        this.dirtyPairs.clear();
        this.flushing = true;

        const tickNumber = this.runtimeFlag.recordSubHourTickStart(pairs.length);
        const start = Date.now();
        try {
            await Sentry.withScope(async (scope) => {
                scope.setTag('module', 'core-layer');
                scope.setTag('core_layer.stage', 'sub-hour-dispatch');
                scope.setTag('core_layer.sub_hour_tick', String(tickNumber));
                scope.setTag('core_layer.sub_hour_pair_count', String(pairs.length));

                // Phase 7.3 — chunked scan fan-out. Match ScannerService's
                // hourly chunking for Binance-weight parity (20 pairs in
                // parallel, Promise.all per chunk).
                const CHUNK = 20;
                let scannerSignals = 0;
                for (let i = 0; i < pairs.length; i += CHUNK) {
                    const chunk = pairs.slice(i, i + CHUNK);
                    const results = await Promise.all(
                        chunk.map((p) => this.scanner.scanSymbolSubHour(p)),
                    );
                    scannerSignals += results.reduce((a, b) => a + b, 0);
                }

                const detectionNow = Date.now();
                const detection = await this.coreLayerDetection.runDetection({
                    now: detectionNow,
                    pairs,
                });

                // `runDetection({ pairs })` skips the time-based lifecycle
                // sweep — that's owned by the hourly cron so pairs outside
                // the scope still age out on schedule. For pairs INSIDE
                // this scope we still need a sweep so sub-hour TFs
                // (15m/5m, and any 1H/4H that happen to sit on a dirty
                // pair) get demoted within the ~30 s debounce instead of
                // waiting up to an hour for the next full sweep.
                const sweep = await this.coreLayerLifecycle.advanceLifecyclesForPairs(
                    pairs,
                    detectionNow,
                );

                const elapsed = Date.now() - start;
                this.runtimeFlag.recordSubHourTickSuccess(elapsed);
                this.logger.log(
                    `Sub-hour tick #${tickNumber} — pairs=${pairs.length} upstreamNew=${scannerSignals} cl.created=${detection.created} cl.promoted=${detection.promoted} cl.demoted=${detection.demoted + sweep.demoted} cl.closed=${detection.closed + sweep.closed} in ${elapsed}ms`,
                );
            });
        } catch (err) {
            this.runtimeFlag.recordSubHourTickFailure(err);
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Sub-hour tick #${tickNumber} failed: ${msg}`);
            Sentry.captureException(err);
        } finally {
            this.flushing = false;
            // If new pairs landed while we were flushing, a close
            // event already scheduled the next flush timer; otherwise
            // we're idle until the next WS close.
        }
    }
}
