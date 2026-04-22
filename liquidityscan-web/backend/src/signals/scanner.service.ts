import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { BinanceWsManager } from '../candles/binance-ws.manager';
import { CandleFetchJob } from '../candles/candle-fetch.job';
import { CandleSnapshotService } from '../candles/candle-snapshot.service';
import { CandlesService } from '../candles/candles.service';
import { CoreLayerDetectionService } from '../core-layer/core-layer.detection.service';
import { CoreLayerRuntimeFlagService } from '../core-layer/core-layer.runtime-flag.service';
import { SignalsService } from './signals.service';
import { CisdScanner } from './scanners/cisd.scanner';
import { CrtScanner } from './scanners/crt.scanner';
import { ThreeOBScanner } from './scanners/3ob.scanner';
import { IctBiasScanner } from './scanners/ict-bias.scanner';
import { RsiDivergenceScanner } from './scanners/rsi-divergence.scanner';
import { SuperEngulfingScanner } from './scanners/super-engulfing.scanner';
/** When false (env MARKET_SCANNER_ENABLED), hourly and manual market scans are skipped — saves Binance API weight during local dev. */
function isMarketScannerEnabledFromEnv(): boolean {
    const v = process.env.MARKET_SCANNER_ENABLED;
    if (v === undefined || v === '') return true;
    const s = String(v).trim().toLowerCase();
    return !['0', 'false', 'no', 'off', 'disabled'].includes(s);
}

type ScannerRsiRuntimeConfig = {
    lbL: number;
    lbR: number;
    rangeLower: number;
    rangeUpper: number;
    limitUpper: number;
    limitLower: number;
};

@Injectable()
export class ScannerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ScannerService.name);
    private readonly marketScannerEnabled = isMarketScannerEnabledFromEnv();
    private isScanningBasic = false;
    private basicScanHourlyTimeout: ReturnType<typeof setTimeout> | null = null;
    private startupTimeout1: ReturnType<typeof setTimeout> | null = null;

    private liveBiasCache = new Map<string, {
        timestamp: number;
        data: Record<string, { bias: string; prevHigh: number; prevLow: number; direction: string }>;
    }>();
    private static readonly BIAS_CACHE_TTL_MS = 60_000;

    private rsiConfig: ScannerRsiRuntimeConfig = {
        lbL: 5,
        lbR: 1,
        rangeLower: 5,
        rangeUpper: 60,
        limitUpper: 70,
        limitLower: 30,
    };

    private static readonly SCANNER_CANDLE_WINDOW = 120;
    private static readonly CISD_CANDLE_WINDOW = 200;

    constructor(
        private readonly candlesService: CandlesService,
        private readonly signalsService: SignalsService,
        private readonly candleSnapshotService: CandleSnapshotService,
        private readonly candleFetchJob: CandleFetchJob,
        private readonly wsManager: BinanceWsManager,
        private readonly superEngulfingScanner: SuperEngulfingScanner,
        private readonly ictBiasScanner: IctBiasScanner,
        private readonly rsiDivergenceScanner: RsiDivergenceScanner,
        private readonly crtScanner: CrtScanner,
        private readonly threeOBScanner: ThreeOBScanner,
        private readonly cisdScanner: CisdScanner,
        private readonly coreLayerDetection: CoreLayerDetectionService,
        private readonly coreLayerRuntimeFlag: CoreLayerRuntimeFlagService,
    ) { }

    /** Whether full-market scanning (hourly + POST /signals/scan) is allowed. */
    isMarketScannerEnabled(): boolean {
        return this.marketScannerEnabled;
    }

    /**
     * Compute live ICT bias for every unique ICT_BIAS symbol in the given timeframe.
     * Results are cached for 60 seconds to avoid hammering Binance.
     */
    async getLiveBias(
        timeframe: string,
    ): Promise<Record<string, { bias: string; prevHigh: number; prevLow: number; direction: string }>> {
        const cached = this.liveBiasCache.get(timeframe);
        if (cached && Date.now() - cached.timestamp < ScannerService.BIAS_CACHE_TTL_MS) {
            return cached.data;
        }

        const data = await this.ictBiasScanner.computeLiveBias(timeframe);
        this.liveBiasCache.set(timeframe, { timestamp: Date.now(), data });
        return data;
    }

    getRsiConfig() {
        return { ...this.rsiConfig };
    }

    setRsiConfig(config: Partial<ScannerRsiRuntimeConfig>) {
        this.rsiConfig = { ...this.rsiConfig, ...config };
        return { ...this.rsiConfig };
    }

    private static msUntilNextHour(): number {
        const now = new Date();
        const next = new Date(now);
        next.setHours(next.getHours() + 1, 0, 0, 0);
        return Math.max(1000, next.getTime() - now.getTime());
    }

    private scheduleBasicScanOnTheHour(): void {
        const run = () => {
            this.basicScanHourlyTimeout = null;
            this.scanBasicStrategies().catch((err) =>
                this.logger.error(`Basic scan error: ${err.message}`),
            );
            const ms = ScannerService.msUntilNextHour();
            this.basicScanHourlyTimeout = setTimeout(run, ms);
            const nextAt = new Date(Date.now() + ms);
            this.logger.log(
                `Basic scan: next scheduled at ${nextAt.toISOString()} (in ${Math.round(ms / 1000)}s, top-of-hour aligned)`,
            );
        };
        const firstDelay = ScannerService.msUntilNextHour();
        this.logger.log(
            `Basic scan: first hourly run in ${Math.round(firstDelay / 1000)}s (aligned to next :00)`,
        );
        this.basicScanHourlyTimeout = setTimeout(run, firstDelay);
    }

    onModuleInit() {
        if (this.marketScannerEnabled) {
            this.logger.log('ScannerService initialized; market scanner ENABLED (hourly scan scheduled).');
            this.scheduleBasicScanOnTheHour();
        } else {
            this.logger.warn(
                'ScannerService: market scanner DISABLED (MARKET_SCANNER_ENABLED=false). No hourly scan; POST /signals/scan is skipped.',
            );
        }

        this.startupTimeout1 = setTimeout(() => {
            this.signalsService.archiveAllStaleSignals()
                .catch((err) => this.logger.error(`Startup archive cleanup error: ${err.message}`));
        }, 10000);
    }

    onModuleDestroy() {
        if (this.basicScanHourlyTimeout) {
            clearTimeout(this.basicScanHourlyTimeout);
            this.basicScanHourlyTimeout = null;
        }
        if (this.startupTimeout1) {
            clearTimeout(this.startupTimeout1);
            this.startupTimeout1 = null;
        }
    }

    async fetchSymbols(): Promise<string[]> {
        return this.candlesService.fetchSymbols();
    }

    async scanBasicStrategies() {
        if (!this.marketScannerEnabled) {
            this.logger.warn('scanBasicStrategies skipped: MARKET_SCANNER_ENABLED is off.');
            return;
        }
        if (this.isScanningBasic) {
            this.logger.warn('Basic scan already in progress, skipping...');
            return;
        }
        this.isScanningBasic = true;
        const start = Date.now();

        try {
            const wsReady = this.wsManager.isReady();
            if (wsReady) {
                this.logger.log('WS manager ready — reading candles from memory (no REST fetch needed)');
            } else {
                this.logger.warn('WS manager not ready — falling back to REST fetch');
                this.logger.log('CandleFetchJob: downloading klines into candle_snapshots...');
                const fetchResult = await this.candleFetchJob.fetchAllCandles();
                this.logger.log(
                    `CandleFetchJob: done (${fetchResult.symbolCount} symbols, ${fetchResult.upsertedRows} rows, ${(fetchResult.elapsedMs / 1000).toFixed(1)}s)`,
                );
            }

            const symbols = await this.fetchSymbols();
            if (symbols.length === 0) {
                this.logger.warn('No symbols found to scan.');
                return;
            }
            const source = wsReady ? 'WS memory' : 'DB snapshots';
            this.logger.log(`Starting strategy scan for ${symbols.length} symbols from ${source} (chunked)...`);

            let signalCount = 0;
            const CHUNK_SIZE = 20;

            for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
                const chunk = symbols.slice(i, i + CHUNK_SIZE);
                const results = await Promise.all(chunk.map(s => this.scanSymbol(s)));
                signalCount += results.reduce((a, b) => a + b, 0);

                if ((i + CHUNK_SIZE) % 80 === 0 || i + CHUNK_SIZE >= symbols.length) {
                    this.logger.log(`Scanned ${Math.min(i + CHUNK_SIZE, symbols.length)}/${symbols.length} symbols...`);
                }
            }

            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            this.logger.log(`Scan completed in ${elapsed}s. Found ${signalCount} new signals.`);

            // Core-Layer piggyback (ADR D11). Runs AFTER base scanners have persisted their
            // per-TF rows because detection reads super_engulfing_signals. Failures here are
            // swallowed on purpose — a Core-Layer regression must not leak into the base
            // signal pipeline, which is the revenue-critical path.
            //
            // Flag read at tick start only (ADR D15 + Phase 5b toggle (c)) — an in-flight
            // tick always finishes. Telemetry is recorded via CoreLayerRuntimeFlagService
            // so the admin `/admin/core-layer/stats` endpoint can report health.
            if (this.coreLayerRuntimeFlag.isEnabled()) {
                const tickNumber = this.coreLayerRuntimeFlag.recordTickStart();
                await Sentry.withScope(async (scope) => {
                    scope.setTag('module', 'core-layer');
                    scope.setTag('core_layer.stage', 'detection');
                    scope.setTag('core_layer.tick', String(tickNumber));
                    const clStart = Date.now();
                    try {
                        const result = await this.coreLayerDetection.runDetection(start);
                        const elapsed = Date.now() - clStart;
                        this.coreLayerRuntimeFlag.recordTickSuccess(elapsed);
                        this.logger.log(
                            `Core-Layer detection: created=${result.created} promoted=${result.promoted} demoted=${result.demoted} anchorChanged=${result.anchorChanged} closed=${result.closed} in ${elapsed}ms`,
                        );
                    } catch (err) {
                        this.coreLayerRuntimeFlag.recordTickFailure(err);
                        const msg = err instanceof Error ? err.message : String(err);
                        this.logger.error(`Core-Layer detection failed: ${msg}`);
                        Sentry.captureException(err);
                    }
                });
            }
        } catch (err) {
            this.logger.error(`Basic scan failed: ${err.message}`);
        } finally {
            this.isScanningBasic = false;
        }
    }

    private async scanSymbol(symbol: string): Promise<number> {
        let count = 0;
        try {
            const w = ScannerService.SCANNER_CANDLE_WINDOW;
            const cisdW = ScannerService.CISD_CANDLE_WINDOW;

            let c1h: import('../signals/indicators').CandleData[];
            let c4h: import('../signals/indicators').CandleData[];
            let c1d: import('../signals/indicators').CandleData[];
            let c1w: import('../signals/indicators').CandleData[];

            if (this.wsManager.isReady()) {
                c1h = this.wsManager.getCandles(symbol, '1h');
                c4h = this.wsManager.getCandles(symbol, '4h');
                c1d = this.wsManager.getCandles(symbol, '1d');
                c1w = this.wsManager.getCandles(symbol, '1w');
            } else {
                [c1h, c4h, c1d, c1w] = await Promise.all([
                    this.candleSnapshotService.getSnapshot(symbol, '1h'),
                    this.candleSnapshotService.getSnapshot(symbol, '4h'),
                    this.candleSnapshotService.getSnapshot(symbol, '1d'),
                    this.candleSnapshotService.getSnapshot(symbol, '1w'),
                ]);
            }

            if (c4h.length === 0 && c1d.length === 0 && c1w.length === 0 && c1h.length === 0) {
                return 0;
            }

            const promises: Promise<number>[] = [];

            for (const tf of ['4h', '1d', '1w'] as const) {
                const c = tf === '4h' ? c4h : tf === '1d' ? c1d : c1w;
                promises.push(this.superEngulfingScanner.scanFromCandles(symbol, tf, c.slice(-w)));
            }

            for (const tf of ['4h', '1d', '1w'] as const) {
                const c = tf === '4h' ? c4h : tf === '1d' ? c1d : c1w;
                promises.push(this.ictBiasScanner.scanFromCandles(symbol, tf, c.slice(-w)));
            }

            for (const tf of ['1h', '4h', '1d'] as const) {
                const c = tf === '1h' ? c1h : tf === '4h' ? c4h : c1d;
                promises.push(
                    this.rsiDivergenceScanner.scanFromCandles(symbol, tf, c.slice(-w), this.rsiConfig),
                );
            }

            for (const tf of ['1h', '4h', '1d', '1w'] as const) {
                const c = tf === '1h' ? c1h : tf === '4h' ? c4h : tf === '1d' ? c1d : c1w;
                promises.push(this.crtScanner.scanFromCandles(symbol, tf, c.slice(-w)));
            }

            for (const tf of ['4h', '1d', '1w'] as const) {
                const c = tf === '4h' ? c4h : tf === '1d' ? c1d : c1w;
                promises.push(this.threeOBScanner.scanFromCandles(symbol, tf, c.slice(-w)));
            }

            for (const tf of ['4h', '1d', '1w'] as const) {
                const c = tf === '4h' ? c4h : tf === '1d' ? c1d : c1w;
                promises.push(this.cisdScanner.scanFromCandles(symbol, tf, c.slice(-cisdW)));
            }

            const results = await Promise.all(promises);
            count = results.reduce((a, b) => a + b, 0);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`scanSymbol(${symbol}) failed: ${msg}`);
        }
        return count;
    }
}
