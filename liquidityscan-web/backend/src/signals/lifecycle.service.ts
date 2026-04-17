import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignalStateService } from './signal-state.service';
import { SignalStatus, SignalResult } from '@prisma/client';
import { CandlesService } from '../candles/candles.service';
import {
    processSeSignal,
    SeRuntimeSignal,
    SeDirection,
    mapResultToLegacy,
    mapStateToLegacyStatus,
} from './se-runtime';

const STRATEGY_CONFIG: Record<string, { tpPercent: number; slPercent: number; expiryCandleCount: number }> = {
    ICT_BIAS: { tpPercent: 2.5, slPercent: 1.5, expiryCandleCount: 15 },
};

const TF_MS: Record<string, number> = {
    '5m': 300000,
    '15m': 900000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000,
    '1w': 604800000,
};

/** Candle length (ms) for ICT_BIAS stuck cutoff in deleteStaleCompletedGlobal: max(48h, 2×tf). */
const ICT_BIAS_STUCK_TF_MS: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
    '1w': 604_800_000,
};

const STUCK_MIN_MS = 48 * 60 * 60 * 1000;

/** Closed klines fetched for CRT lifecycle — must cover first/second candles after signal openTime. */
const CRT_LIFECYCLE_KLINE_LIMIT = 120;

interface BinanceTicker {
    symbol: string;
    price: string;
}

@Injectable()
export class LifecycleService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(LifecycleService.name);
    private intervalRef: ReturnType<typeof setInterval> | null = null;
    private deleteIntervalRef: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly stateService: SignalStateService,
        private readonly candlesService: CandlesService,
    ) { }

    onModuleInit() {
        this.logger.log('Signal Lifecycle Service started — checking every 5 minutes');
        setTimeout(() => this.checkAllSignals(), 10_000); // 10s after startup
        this.intervalRef = setInterval(() => this.checkAllSignals(), 5 * 60 * 1000);

        // SE v2: Hard-delete job runs every 15 minutes
        // SPEC: Signals closed for 48+ hours are permanently deleted
        this.logger.log('SE v2 Delete Job initialized — running every 15 minutes');
        setTimeout(() => this.deleteExpiredSeSignals(), 30_000); // 30s after startup
        this.deleteIntervalRef = setInterval(() => this.deleteExpiredSeSignals(), 15 * 60 * 1000);
    }

    onModuleDestroy() {
        if (this.intervalRef) {
            clearInterval(this.intervalRef);
            this.intervalRef = null;
        }
        if (this.deleteIntervalRef) {
            clearInterval(this.deleteIntervalRef);
            this.deleteIntervalRef = null;
        }
    }

    private async fetchAllPrices(): Promise<Map<string, number>> {
        return this.candlesService.getCurrentPrices();
    }

    /**
     * SE Scanner v2: Hard-delete expired SE signals
     * 
     * SPEC DELETION RULE:
     * IF signal.state == "closed" AND current_time >= signal.delete_at:
     *     DELETE signal FROM database
     *     // No archive. No move to another table. Permanently gone.
     * 
     * delete_at is always set to closed_at + 48 hours at the moment the signal closes.
     * Run this check on a scheduled job (e.g., every 15 minutes).
     */
    private async deleteExpiredSeSignals(): Promise<void> {
        try {
            const now = new Date();

            // Find and delete SE signals that are closed and past their delete_at time
            const result = await (this.prisma as any).superEngulfingSignal.deleteMany({
                where: {
                    strategyType: 'SUPER_ENGULFING',
                    state: 'closed',
                    delete_at: { lte: now },
                },
            });

            const legacyClosed = await (this.prisma as any).superEngulfingSignal.deleteMany({
                where: {
                    strategyType: 'SUPER_ENGULFING',
                    state: 'closed',
                    delete_at: null,
                    closedAt: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
                },
            });

            if (result.count > 0 || legacyClosed.count > 0) {
                this.logger.log(
                    `SE v2 Delete Job: deleted ${result.count} by delete_at, ${legacyClosed.count} legacy closed (delete_at null, closedAt >48h).`,
                );
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`SE v2 Delete Job failed: ${msg}`);
        }
    }

    async checkAllSignals(): Promise<void> {
        try {
            // ============================
            // SE SCANNER V2 LIFECYCLE
            // Process signals with state='live' using processSeSignal
            // ============================
            await this.checkSuperEngulfingV2();

            // ============================
            // CRT: body close validation (STRONG / WEAK / FAILED), then 24h hard delete of COMPLETED
            // ============================
            await this.checkCrtLifecycle();

            // ============================
            // 3OB: WIN / INSTANT FAIL / TIME FAIL, then 24h hard delete of COMPLETED
            // ============================
            await this.check3OBLifecycle();

            // ============================
            // ICT BIAS LIFECYCLE — Next Candle Body Close Validation
            // ============================
            // Scanner inserts ICT_BIAS as ACTIVE (Option A: no scanner-side replacement); legacy rows may still be PENDING
            const biasSignals = await (this.prisma as any).superEngulfingSignal.findMany({
                where: {
                    strategyType: 'ICT_BIAS',
                    lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
                    bias_level: { not: null },
                    bias_direction: { not: null },
                },
            });

            let biasWin = 0, biasFailed = 0;

            const BATCH_SIZE = 10;
            for (let i = 0; i < biasSignals.length; i += BATCH_SIZE) {
                const batch = biasSignals.slice(i, i + BATCH_SIZE);
                const results = await Promise.all(batch.map(async (bias) => {
                    try {
                        // Get the latest closed candles for this TF
                        const tfCandles = await this.candlesService.getKlines(bias.symbol, bias.timeframe, 5);
                        if (tfCandles.length < 2) return null;

                        // The bias was detected at bias.detectedAt — we need the NEXT closed candle after that
                        const biasDetectedMs = new Date(bias.detectedAt).getTime();
                        const tfMs = TF_MS[bias.timeframe] || 14400000;

                        // First candle strictly AFTER the signal bar (openTime > detectedAt), not the same bar
                        const nextCandle = tfCandles.find(c => {
                            const candleOpenMs = new Date(c.openTime).getTime();
                            return candleOpenMs > biasDetectedMs;
                        });

                        if (!nextCandle) return null; // Next candle hasn't formed yet

                        // Check if this candle is CLOSED (its open time + TF duration < now)
                        const candleCloseMs = new Date(nextCandle.openTime).getTime() + tfMs;
                        if (candleCloseMs > Date.now()) return null; // Still forming, wait

                        // BODY CLOSE VALIDATION — ignore wicks!
                        const nextClose = nextCandle.close;
                        let result: 'WIN' | 'FAILED';

                        if (bias.bias_direction === 'BULL') {
                            result = nextClose > bias.bias_level ? 'WIN' : 'FAILED';
                        } else {
                            result = nextClose < bias.bias_level ? 'WIN' : 'FAILED';
                        }

                        // Update signal
                        const signalResult = result === 'WIN' ? SignalResult.WIN : SignalResult.LOSS;
                        const transitioned = await this.stateService.transitionSignal(bias.id, SignalStatus.COMPLETED, {
                            result: signalResult,
                            closedPrice: nextClose,
                            pnlPercent: this.calcPnl(bias.bias_direction === 'BULL', bias.bias_level, nextClose),
                        });
                        if (!transitioned) return null;

                        try {
                            await (this.prisma as any).superEngulfingSignal.update({
                                where: { id: bias.id },
                                data: {
                                    bias_result: result,
                                    bias_validated_at: new Date(),
                                    closedAt: new Date(),
                                    se_close_price: nextClose,
                                },
                            });
                        } catch (upErr) {
                            if (!LifecycleService.isPrismaRecordNotFound(upErr)) throw upErr;
                            this.logger.warn(
                                `Bias lifecycle: follow-up update skipped for ${bias.id} (row not found, P2025)`,
                            );
                        }

                        return result;
                    } catch (err) {
                        this.logger.error(`Bias lifecycle error for ${bias.id}: ${err}`);
                        return null;
                    }
                }));

                for (const res of results) {
                    if (res === 'WIN') biasWin++;
                    else if (res === 'FAILED') biasFailed++;
                }
            }

            if (biasSignals.length > 0) {
                this.logger.log(`Bias Lifecycle: ${biasWin} WIN, ${biasFailed} FAILED out of ${biasSignals.length} pending.`);
            }

            // ============================
            // CISD: 200-candle expiry + stale row cleanup
            // ============================
            await this.checkCisdLifecycle();

            await this.deleteStaleCompletedGlobal();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Lifecycle check failed: ${msg}`);
        }
    }

    /**
     * CRT: classify next 1–2 candle body closes vs entry / prev range (STRONG | WEAK | FAILED).
     * RSIDIVERGENCE stale rows are closed by scanner-driven closeStaleRsiSignals (SignalsService).
     */
    private async checkCrtLifecycle(): Promise<void> {
        const signals = await (this.prisma as any).superEngulfingSignal.findMany({
            where: {
                strategyType: 'CRT',
                lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
            },
        });
        if (signals.length === 0) {
            await this.deleteStaleCrtCompleted();
            return;
        }

        const now = Date.now();
        let strong = 0;
        let weak = 0;
        let failed = 0;

        const openMs = (t: Date | string | number) => new Date(t).getTime();

        for (const signal of signals) {
            try {
                const tfMs = TF_MS[signal.timeframe] || TF_MS['4h'];
                const detectedAt = new Date(signal.detectedAt).getTime();
                const candlesSince = Math.floor((now - detectedAt) / tfMs);

                if (candlesSince < 1) continue;

                const klines = await this.candlesService.getKlines(
                    signal.symbol,
                    signal.timeframe,
                    CRT_LIFECYCLE_KLINE_LIMIT,
                );
                const closed = klines.slice(0, -1);
                if (closed.length < 1) continue;

                const postSignal = closed
                    .filter((c) => openMs(c.openTime) > detectedAt)
                    .sort((a, b) => openMs(a.openTime) - openMs(b.openTime));

                const firstCandle = postSignal[0];
                if (!firstCandle) continue;

                const secondCandle =
                    candlesSince >= 2 && postSignal.length >= 2 ? postSignal[1] : undefined;

                const entry = Number(signal.price);
                if (!Number.isFinite(entry) || entry <= 0) continue;

                const meta = signal.metadata as Record<string, unknown> | null | undefined;
                const prevHigh = Number(meta?.prev_high ?? meta?.prevHigh ?? 0);
                const prevLow = Number(meta?.prev_low ?? meta?.prevLow ?? 0);
                const isBuy = signal.signalType === 'BUY';

                let result: 'STRONG' | 'WEAK' | 'FAILED' | null = null;
                let closePx = firstCandle.close;

                const c1 = firstCandle.close;
                if (isBuy) {
                    if (c1 > prevHigh) result = 'STRONG';
                    else if (c1 > entry) result = 'WEAK';
                    else if (c1 < entry) result = 'FAILED';
                } else {
                    if (c1 < prevLow) result = 'STRONG';
                    else if (c1 < entry) result = 'WEAK';
                    else if (c1 > entry) result = 'FAILED';
                }

                if (result === null && secondCandle) {
                    const c2 = secondCandle.close;
                    closePx = secondCandle.close;
                    if (isBuy) {
                        if (c2 > prevHigh) result = 'STRONG';
                        else if (c2 > entry) result = 'WEAK';
                        else result = 'FAILED';
                    } else {
                        if (c2 < prevLow) result = 'STRONG';
                        else if (c2 < entry) result = 'WEAK';
                        else result = 'FAILED';
                    }
                }

                if (result === null && candlesSince >= 2) {
                    result = 'FAILED';
                    closePx = secondCandle?.close ?? firstCandle.close;
                }

                if (result === null) continue;

                const signalResult = result === 'FAILED' ? SignalResult.LOSS : SignalResult.WIN;

                const transitioned = await this.stateService.transitionSignal(signal.id, SignalStatus.COMPLETED, {
                    result: signalResult,
                    closedPrice: closePx,
                    pnlPercent: this.calcPnl(isBuy, entry, closePx),
                });
                if (!transitioned) continue;

                try {
                    await (this.prisma as any).superEngulfingSignal.update({
                        where: { id: signal.id },
                        data: {
                            se_close_reason: result,
                            se_close_price: closePx,
                            closedAt: new Date(),
                        },
                    });
                } catch (upErr) {
                    if (!LifecycleService.isPrismaRecordNotFound(upErr)) throw upErr;
                    this.logger.warn(
                        `CRT lifecycle: follow-up update skipped for ${signal.id} (row not found, P2025)`,
                    );
                }

                if (result === 'STRONG') strong++;
                else if (result === 'WEAK') weak++;
                else failed++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.error(`CRT lifecycle error for ${signal.id}: ${msg}`);
            }
        }

        if (strong + weak + failed > 0) {
            this.logger.log(`CRT lifecycle: ${strong} STRONG, ${weak} WEAK, ${failed} FAILED.`);
        }

        await this.deleteStaleCrtCompleted();
    }

    private async deleteStaleCrtCompleted(): Promise<void> {
        try {
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const res = await (this.prisma as any).superEngulfingSignal.deleteMany({
                where: {
                    strategyType: 'CRT',
                    lifecycleStatus: 'COMPLETED',
                    closedAt: { lt: cutoff },
                },
            });
            if (res.count > 0) {
                this.logger.log(`CRT lifecycle: deleted ${res.count} COMPLETED rows older than 24h.`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`CRT delete stale COMPLETED failed: ${msg}`);
        }
    }

    /**
     * 3-Order-Block lifecycle: first outcome among post-detection closed candles wins —
     * instant FAIL on wick vs formation extreme, WIN on body close past entry, else TIME FAIL after 5+ candles.
     */
    private async check3OBLifecycle(): Promise<void> {
        const TF_MS_3OB: Record<string, number> = {
            '1m': 60_000,
            '5m': 300_000,
            '15m': 900_000,
            '1h': 3_600_000,
            '4h': 14_400_000,
            '1d': 86_400_000,
            '1w': 604_800_000,
        };
        const openMs = (t: Date | string | number) => new Date(t).getTime();

        const signals = await this.prisma.superEngulfingSignal.findMany({
            where: {
                strategyType: '3OB',
                lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
            },
        });

        if (signals.length === 0) {
            await this.deleteStale3OBCompleted();
            return;
        }

        const now = Date.now();
        let wins = 0;
        let failed = 0;

        for (const signal of signals) {
            try {
                const tfKey = signal.timeframe.trim().toLowerCase();
                const tfMs = TF_MS_3OB[tfKey] ?? TF_MS_3OB['4h'];
                const detectedAtMs = new Date(signal.detectedAt).getTime();
                const candlesSince = Math.floor((now - detectedAtMs) / tfMs);

                if (candlesSince < 1) continue;

                const klines = await this.candlesService.getKlines(signal.symbol, signal.timeframe, 8);
                const closed = klines.slice(0, -1);
                if (closed.length < 2) continue;

                const postSignalCandles = closed
                    .filter((c) => openMs(c.openTime) > detectedAtMs)
                    .sort((a, b) => openMs(a.openTime) - openMs(b.openTime));

                if (postSignalCandles.length === 0) continue;

                const entry = Number(signal.price);
                const meta = signal.metadata as Record<string, unknown> | null | undefined;
                const lowestLow = Number(meta?.lowestlow ?? meta?.lowestLow ?? 0);
                const highestHigh = Number(meta?.highesthigh ?? meta?.highestHigh ?? 0);
                const isBuy = signal.signalType === 'BUY';

                if (!Number.isFinite(entry) || entry <= 0) continue;
                if (!Number.isFinite(lowestLow) || !Number.isFinite(highestHigh)) continue;

                let result: 'WIN' | 'FAILED' | null = null;
                let closePx = entry;

                for (const candle of postSignalCandles) {
                    if (isBuy && candle.low <= lowestLow) {
                        result = 'FAILED';
                        closePx = candle.close;
                        break;
                    }
                    if (!isBuy && candle.high >= highestHigh) {
                        result = 'FAILED';
                        closePx = candle.close;
                        break;
                    }

                    if (isBuy && candle.close > entry) {
                        result = 'WIN';
                        closePx = candle.close;
                        break;
                    }
                    if (!isBuy && candle.close < entry) {
                        result = 'WIN';
                        closePx = candle.close;
                        break;
                    }
                }

                if (result === null && candlesSince >= 5) {
                    result = 'FAILED';
                    const last = postSignalCandles[postSignalCandles.length - 1];
                    closePx = last ? last.close : entry;
                }

                if (result === null) continue;

                const signalResult = result === 'WIN' ? SignalResult.WIN : SignalResult.LOSS;
                const reason = result === 'WIN' ? 'WIN' : 'FAILED';

                const transitioned = await this.stateService.transitionSignal(signal.id, SignalStatus.COMPLETED, {
                    result: signalResult,
                    closedPrice: closePx,
                    pnlPercent: this.calcPnl(isBuy, entry, closePx),
                });
                if (!transitioned) continue;

                if (result === 'WIN') wins++;
                else failed++;

                try {
                    await this.prisma.superEngulfingSignal.update({
                        where: { id: signal.id },
                        data: {
                            se_close_reason: reason,
                            closedAt: new Date(),
                            se_close_price: closePx,
                        },
                    });
                } catch (upErr) {
                    if (!LifecycleService.isPrismaRecordNotFound(upErr)) throw upErr;
                    this.logger.warn(
                        `3OB lifecycle: follow-up update skipped for ${signal.id} (row not found, P2025)`,
                    );
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.error(`3OB lifecycle error for ${signal.id}: ${msg}`);
            }
        }

        await this.deleteStale3OBCompleted();

        if (wins + failed > 0) {
            this.logger.log(`3OB lifecycle: WIN=${wins}, FAILED=${failed}`);
        }
    }

    private async deleteStale3OBCompleted(): Promise<void> {
        try {
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const res = await this.prisma.superEngulfingSignal.deleteMany({
                where: {
                    strategyType: '3OB',
                    lifecycleStatus: 'COMPLETED',
                    closedAt: { lt: cutoff },
                },
            });
            if (res.count > 0) {
                this.logger.log(`3OB lifecycle: deleted ${res.count} COMPLETED rows older than 24h.`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`3OB delete stale COMPLETED failed: ${msg}`);
        }
    }

    /**
     * ICT_BIAS: allow up to ~2× candle length (min 48h) before STUCK_EXPIRED so 1w can validate
     * after the next weekly candle closes. CRT stuck cleanup uses a flat 48h cutoff; RSIDIVERGENCE uses 15-candle expiry via SignalsService.closeStaleRsiSignals.
     */
    private static getIctBiasStuckThresholdMs(timeframe: string): number {
        const key = timeframe.trim().toLowerCase();
        const tfMs = ICT_BIAS_STUCK_TF_MS[key] ?? ICT_BIAS_STUCK_TF_MS['4h'];
        return Math.max(STUCK_MIN_MS, 2 * tfMs);
    }

    /** CISD: expire after 200 candles; delete closed CISD and legacy CISD_RETEST rows older than 24h. */
    private async checkCisdLifecycle(): Promise<void> {
        const now = Date.now();

        // ── PART 1: CISD expiry (200 candles) ──
        const cisdSignals = await (this.prisma as any).superEngulfingSignal.findMany({
            where: {
                strategyType: 'CISD',
                lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
            },
        });

        let cisdExpired = 0;

        for (const signal of cisdSignals) {
            try {
                const tfMs = TF_MS[signal.timeframe] || TF_MS['4h'];
                const detectedAt = new Date(signal.detectedAt).getTime();
                const candlesSince = Math.floor((now - detectedAt) / tfMs);
                if (candlesSince < 200) continue;

                const transitioned = await this.stateService.transitionSignal(signal.id, SignalStatus.EXPIRED, {
                    closedPrice: Number(signal.price),
                });
                if (!transitioned) continue;

                try {
                    await (this.prisma as any).superEngulfingSignal.update({
                        where: { id: signal.id },
                        data: { se_close_reason: 'CANDLE_EXPIRY', closedAt: new Date() },
                    });
                } catch (e: unknown) {
                    if (!LifecycleService.isPrismaRecordNotFound(e)) throw e;
                }

                cisdExpired++;
            } catch (err) {
                this.logger.error(`CISD expiry error for ${signal.id}: ${err}`);
            }
        }

        // ── PART 2: Hard-delete closed CISD + legacy CISD_RETEST >24h ago ──
        await (this.prisma as any).superEngulfingSignal.deleteMany({
            where: {
                strategyType: { in: ['CISD', 'CISD_RETEST'] },
                lifecycleStatus: { in: ['COMPLETED', 'EXPIRED'] },
                closedAt: { lt: new Date(now - 24 * 60 * 60 * 1000) },
            },
        });

        if (cisdExpired > 0) {
            this.logger.log(`CISD lifecycle: ${cisdExpired} expired.`);
        }
    }

    /**
     * Periodic global cleanup: ICT_BIAS + RSI COMPLETED older than 24h (symbols that stopped scanning),
     * force-close stuck CRT and ICT_BIAS when elapsed since detectedAt exceeds per-TF threshold:
     * max(48h, 2×candle length) — e.g. 1w CRT needs ~14d before STUCK_EXPIRED. RSIDIVERGENCE is not force-closed here.
     */
    private async deleteStaleCompletedGlobal(): Promise<void> {
        try {
            const nowMs = Date.now();
            const cutoff24 = new Date(nowMs - 24 * 60 * 60 * 1000);
            const cutoff48 = new Date(nowMs - 48 * 60 * 60 * 1000);

            const delIct = await this.prisma.superEngulfingSignal.deleteMany({
                where: {
                    strategyType: 'ICT_BIAS',
                    lifecycleStatus: 'COMPLETED',
                    closedAt: { lt: cutoff24 },
                },
            });
            const delRsi = await this.prisma.superEngulfingSignal.deleteMany({
                where: {
                    strategyType: 'RSIDIVERGENCE',
                    lifecycleStatus: 'COMPLETED',
                    closedAt: { lt: cutoff24 },
                },
            });
            if (delIct.count + delRsi.count > 0) {
                this.logger.log(
                    `Global stale cleanup: deleted ${delIct.count} ICT_BIAS and ${delRsi.count} RSIDIVERGENCE COMPLETED rows older than 24h.`,
                );
            }

            const stuckCrtCandidates = await this.prisma.superEngulfingSignal.findMany({
                where: {
                    strategyType: 'CRT',
                    lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
                    detectedAt: { lt: cutoff48 },
                },
                select: {
                    id: true,
                    strategyType: true,
                    price: true,
                    signalType: true,
                    bias_direction: true,
                    bias_level: true,
                    timeframe: true,
                    detectedAt: true,
                },
            });

            const stuckCrt = stuckCrtCandidates.filter((row) => {
                const elapsed = nowMs - new Date(row.detectedAt).getTime();
                const tfMs = TF_MS[row.timeframe] || TF_MS['4h'];
                return elapsed >= Math.max(STUCK_MIN_MS, 2 * tfMs);
            });

            const ictStuckCandidates = await this.prisma.superEngulfingSignal.findMany({
                where: {
                    strategyType: 'ICT_BIAS',
                    lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
                    detectedAt: { lt: cutoff48 },
                },
                select: {
                    id: true,
                    strategyType: true,
                    price: true,
                    signalType: true,
                    bias_direction: true,
                    bias_level: true,
                    timeframe: true,
                    detectedAt: true,
                },
            });

            const stuckIct = ictStuckCandidates.filter((row) => {
                const elapsed = nowMs - new Date(row.detectedAt).getTime();
                return elapsed >= LifecycleService.getIctBiasStuckThresholdMs(row.timeframe);
            });

            const stuck = [...stuckCrt, ...stuckIct];

            let stuckClosed = 0;
            for (const s of stuck) {
                const priceNum = Number(s.price);
                if (!Number.isFinite(priceNum) || priceNum <= 0) continue;

                let pnlPercent = 0;
                if (s.strategyType === 'ICT_BIAS' && s.bias_direction && s.bias_level != null) {
                    const level = Number(s.bias_level);
                    if (Number.isFinite(level)) {
                        pnlPercent = this.calcPnl(s.bias_direction === 'BULL', level, priceNum);
                    }
                } else if (s.strategyType === 'CRT') {
                    const isBuy = s.signalType === 'BUY';
                    pnlPercent = this.calcPnl(isBuy, priceNum, priceNum);
                }

                const transitioned = await this.stateService.transitionSignal(s.id, SignalStatus.COMPLETED, {
                    result: SignalResult.LOSS,
                    closedPrice: priceNum,
                    pnlPercent,
                });
                if (!transitioned) continue;
                stuckClosed++;

                const extra: Record<string, unknown> = {
                    se_close_reason: 'STUCK_EXPIRED',
                    closedAt: new Date(),
                };
                if (s.strategyType === 'ICT_BIAS') {
                    extra.bias_result = 'FAILED';
                    extra.bias_validated_at = new Date();
                }
                try {
                    await this.prisma.superEngulfingSignal.update({
                        where: { id: s.id },
                        data: extra as any,
                    });
                } catch (upErr) {
                    if (!LifecycleService.isPrismaRecordNotFound(upErr)) throw upErr;
                }
            }

            if (stuckClosed > 0) {
                this.logger.log(
                    `Global stale cleanup: force-completed ${stuckClosed} stuck PENDING/ACTIVE (CRT & ICT_BIAS: per-TF threshold max(48h, 2×candle)).`,
                );
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`deleteStaleCompletedGlobal failed: ${msg}`);
        }
    }

    private static isPrismaRecordNotFound(err: unknown): boolean {
        return (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code: string }).code === 'P2025'
        );
    }

    /**
     * Calculate the actual number of completed candles since signal triggered,
     * based on the signal's timeframe. Only returns true for isCandleClose when
     * a NEW candle has closed since the last check (based on stored candle_count).
     * 
     * SPEC: candle_count starts at 0 when the signal goes live.
     * The SE trigger candle itself does NOT count.
     * The first increment happens when the NEXT candle after the SE candle closes.
     */
    private calcCandleInfo(triggeredAt: Date, timeframe: string, currentCandleCount: number): { actualCandleCount: number; isCandleClose: boolean } {
        const tfMs = TF_MS[timeframe] || TF_MS['4h'];
        const nowMs = Date.now();
        const triggeredMs = triggeredAt.getTime();
        const elapsed = nowMs - triggeredMs;

        if (elapsed <= 0) {
            return { actualCandleCount: 0, isCandleClose: false };
        }

        // How many full candles have closed since the signal was triggered
        const actualCandleCount = Math.floor(elapsed / tfMs);

        // isCandleClose is true only if a NEW candle closed since we last checked
        const isCandleClose = actualCandleCount > currentCandleCount;

        return { actualCandleCount, isCandleClose };
    }

    /**
     * SE Scanner v2 Lifecycle Check
     * 
     * SPEC: Process all live SE signals using the new processSeSignal function.
     * - Query signals where state='live' and strategyType='SUPER_ENGULFING'
     * - For each signal, get current price and call processSeSignal
     * - Persist any changed fields to DB
     * - Also update legacy fields for backward compatibility
     * 
     * CANDLE COUNT FIX: We calculate actual candle closes based on triggered_at
     * and the signal's timeframe, NOT treating every 5-min check as a candle close.
     * For 4H signals, a candle closes every 4 hours. For 1D every 24 hours. etc.
     */
    private async checkSuperEngulfingV2(): Promise<void> {
        // Query SE signals with v2 state='live'
        const liveSeSignals = await (this.prisma as any).superEngulfingSignal.findMany({
            where: {
                strategyType: 'SUPER_ENGULFING',
                state: 'live',
            },
        });

        if (liveSeSignals.length === 0) {
            this.logger.log('SE v2 Lifecycle: 0 live SE signals.');
            return;
        }

        this.logger.log(`SE v2 Lifecycle: processing ${liveSeSignals.length} live signals...`);

        const priceMap = await this.fetchAllPrices();
        if (priceMap.size === 0) {
            this.logger.warn('No prices fetched — skipping SE v2 lifecycle check');
            return;
        }

        // Fetch recent 5m candle high/low for all symbols with live signals.
        // This detects SL/TP breaches that occurred BETWEEN 5-min lifecycle checks.
        const symbolsToCheck = Array.from(new Set<string>(liveSeSignals.map((s: any) => s.symbol)));
        const candleExtremes = new Map<string, { high: number; low: number }>();

        const CONCURRENCY = 10;
        for (let i = 0; i < symbolsToCheck.length; i += CONCURRENCY) {
            const batch = symbolsToCheck.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async (symbol) => {
                try {
                    const candles = await this.candlesService.getKlines(symbol, '5m', 2);
                    if (candles.length >= 2) {
                        const lastClosed = candles[candles.length - 2];
                        candleExtremes.set(symbol, {
                            high: lastClosed.high,
                            low: lastClosed.low,
                        });
                    }
                } catch { /* skip — will fall back to ticker only */ }
            }));
        }

        const now = new Date();
        let tp1Hit = 0, tp2Hit = 0, tp3Hit = 0, slHit = 0, expired = 0, unchanged = 0;

        const SE_BATCH_SIZE = 10;
        for (let i = 0; i < liveSeSignals.length; i += SE_BATCH_SIZE) {
            const batch = liveSeSignals.slice(i, i + SE_BATCH_SIZE);
            const batchResults = await Promise.all(batch.map(async (signal) => {
                const currentPrice = priceMap.get(signal.symbol);
                if (currentPrice === undefined) {
                    return { type: 'unchanged' };
                }

                const triggeredAt = signal.triggered_at ?? signal.detectedAt;
                const currentCandleCount = signal.candle_count ?? signal.candles_tracked ?? 0;

                // Calculate actual candle closes based on timeframe, NOT every 5 minutes
                const candleInfo = this.calcCandleInfo(
                    new Date(triggeredAt),
                    signal.timeframe,
                    currentCandleCount
                );

                // Build SeRuntimeSignal from DB row
                // IMPORTANT: Use the ACTUAL candle count, not the DB value
                const runtimeSignal: SeRuntimeSignal = {
                    id: signal.id,
                    direction_v2: (signal.direction_v2 || (signal.direction === 'BULL' ? 'bullish' : 'bearish')) as SeDirection,
                    entry_price: signal.entry_price ?? signal.se_entry_zone ?? Number(signal.price),
                    sl_price: signal.sl_price ?? signal.se_sl ?? 0,
                    current_sl_price: signal.current_sl_price ?? signal.se_current_sl ?? signal.sl_price ?? signal.se_sl ?? 0,
                    tp1_price: signal.tp1_price ?? signal.se_tp1 ?? 0,
                    tp2_price: signal.tp2_price ?? signal.se_tp2 ?? 0,
                    tp3_price: signal.tp3_price ?? 0,
                    state: signal.state as 'live' | 'closed',
                    tp1_hit: signal.tp1_hit ?? signal.se_r_ratio_hit ?? false,
                    tp2_hit: signal.tp2_hit ?? false,
                    tp3_hit: signal.tp3_hit ?? false,
                    result_v2: signal.result_v2 ?? null,
                    result_type: signal.result_type ?? null,
                    candle_count: candleInfo.isCandleClose ? candleInfo.actualCandleCount - 1 : candleInfo.actualCandleCount,
                    max_candles: signal.max_candles ?? 10,
                    triggered_at: triggeredAt,
                    closed_at_v2: signal.closed_at_v2 ?? null,
                    delete_at: signal.delete_at ?? null,
                };

                if (
                    runtimeSignal.sl_price === 0 ||
                    runtimeSignal.tp1_price === 0 ||
                    runtimeSignal.tp2_price === 0 ||
                    runtimeSignal.tp3_price === 0 ||
                    runtimeSignal.entry_price === 0
                ) {
                    this.logger.warn(
                        `SE v3 Lifecycle: Skipping signal ${signal.id} — missing price data ` +
                        `(entry=${runtimeSignal.entry_price}, sl=${runtimeSignal.sl_price}, ` +
                        `tp1=${runtimeSignal.tp1_price}, tp2=${runtimeSignal.tp2_price}, tp3=${runtimeSignal.tp3_price}). ` +
                        `Signal may need manual cleanup or re-detection.`
                    );
                    return { type: 'unchanged' };
                }

                // Determine effective price using 5m candle extremes to catch
                // SL/TP breaches that occurred between lifecycle checks.
                const extremes = candleExtremes.get(signal.symbol);
                let effectivePrice = currentPrice;

                if (extremes) {
                    const dir = runtimeSignal.direction_v2;
                    if (dir === 'bullish') {
                        const bestPrice = Math.max(currentPrice, extremes.high);
                        const worstPrice = Math.min(currentPrice, extremes.low);
                        if (!runtimeSignal.tp1_hit && bestPrice >= runtimeSignal.tp1_price) {
                            effectivePrice = bestPrice;
                        } else if (runtimeSignal.tp1_hit && !runtimeSignal.tp2_hit && bestPrice >= runtimeSignal.tp2_price) {
                            effectivePrice = bestPrice;
                        } else if (runtimeSignal.tp2_hit && !runtimeSignal.tp3_hit && bestPrice >= runtimeSignal.tp3_price) {
                            effectivePrice = bestPrice;
                        } else if (worstPrice <= runtimeSignal.current_sl_price) {
                            effectivePrice = worstPrice;
                        }
                    } else {
                        const bestPrice = Math.min(currentPrice, extremes.low);
                        const worstPrice = Math.max(currentPrice, extremes.high);
                        if (!runtimeSignal.tp1_hit && bestPrice <= runtimeSignal.tp1_price) {
                            effectivePrice = bestPrice;
                        } else if (runtimeSignal.tp1_hit && !runtimeSignal.tp2_hit && bestPrice <= runtimeSignal.tp2_price) {
                            effectivePrice = bestPrice;
                        } else if (runtimeSignal.tp2_hit && !runtimeSignal.tp3_hit && bestPrice <= runtimeSignal.tp3_price) {
                            effectivePrice = bestPrice;
                        } else if (worstPrice >= runtimeSignal.current_sl_price) {
                            effectivePrice = worstPrice;
                        }
                    }
                }

                const result = processSeSignal(runtimeSignal, {
                    currentPrice: effectivePrice,
                    isCandleClose: candleInfo.isCandleClose,
                    now,
                });

                if (!result.changed) {
                    // Even if processSeSignal didn't change anything, sync candle_count if needed
                    if (candleInfo.actualCandleCount !== currentCandleCount) {
                        await (this.prisma as any).superEngulfingSignal.update({
                            where: { id: signal.id },
                            data: {
                                candle_count: candleInfo.actualCandleCount,
                                candles_tracked: candleInfo.actualCandleCount,
                            },
                        });
                    }
                    return { type: 'unchanged' };
                }

                // Prepare update data
                const updateData: any = {};

                // V2 fields
                if (result.state !== undefined) updateData.state = result.state;
                if (result.tp1_hit !== undefined) updateData.tp1_hit = result.tp1_hit;
                if (result.tp2_hit !== undefined) updateData.tp2_hit = result.tp2_hit;
                if (result.tp3_hit !== undefined) updateData.tp3_hit = result.tp3_hit;
                if (result.current_sl_price !== undefined) updateData.current_sl_price = result.current_sl_price;
                if (result.result_v2 !== undefined) updateData.result_v2 = result.result_v2;
                if (result.result_type !== undefined) updateData.result_type = result.result_type;
                if (result.candle_count !== undefined) {
                    updateData.candle_count = result.candle_count;
                } else {
                    updateData.candle_count = candleInfo.actualCandleCount;
                }
                if (result.closed_at_v2 !== undefined) updateData.closed_at_v2 = result.closed_at_v2;
                if (result.delete_at !== undefined) updateData.delete_at = result.delete_at;

                // Also update legacy fields for backward compat
                if (result.tp1_hit !== undefined) {
                    updateData.se_r_ratio_hit = result.tp1_hit;
                }
                if (result.current_sl_price !== undefined) {
                    updateData.se_current_sl = result.current_sl_price;
                }
                updateData.candles_tracked = updateData.candle_count;

                // If signal closed, update legacy lifecycle fields
                if (result.state === 'closed') {
                    const legacyResult = mapResultToLegacy(result.result_v2 ?? null);
                    const legacyStatus = mapStateToLegacyStatus(result.state, result.result_v2 ?? null);

                    updateData.lifecycleStatus = legacyStatus;
                    if (legacyResult) {
                        updateData.result = legacyResult;
                    }
                    updateData.closedAt = result.closed_at_v2;

                    if (result.result_type === 'sl') {
                        updateData.se_close_price = runtimeSignal.current_sl_price;
                    } else if (result.result_type === 'tp1') {
                        updateData.se_close_price = runtimeSignal.tp1_price;
                    } else if (result.result_type === 'tp2') {
                        updateData.se_close_price = runtimeSignal.tp2_price;
                    } else if (result.result_type === 'tp3_full') {
                        updateData.se_close_price = runtimeSignal.tp3_price;
                    } else {
                        // candle_expiry — only case where actual market price matters
                        updateData.se_close_price = currentPrice;
                    }

                    const closePrice = updateData.se_close_price;
                    updateData.close_price = closePrice; // v3 spec field

                    // Map result_type to legacy se_close_reason
                    if (result.result_type === 'tp3_full') {
                        updateData.se_close_reason = 'TP3';
                    } else if (result.result_type === 'tp2') {
                        updateData.se_close_reason = 'TP2';
                    } else if (result.result_type === 'tp1') {
                        updateData.se_close_reason = 'TP1';
                    } else if (result.result_type === 'sl') {
                        updateData.se_close_reason = 'SL';
                    } else if (result.result_type === 'candle_expiry') {
                        updateData.se_close_reason = 'EXPIRED';
                    }

                    // Legacy status/outcome fields
                    updateData.status = legacyResult === 'WIN' ? 'HIT_TP' : legacyResult === 'LOSS' ? 'HIT_SL' : 'EXPIRED';
                    updateData.outcome = updateData.status;

                    // Also update legacy se_r_ratio_hit for tp2/tp3 cases
                    if (result.tp2_hit !== undefined) updateData.se_r_ratio_hit = true;

                    const isBull = runtimeSignal.direction_v2 === 'bullish';
                    updateData.pnlPercent = this.calcPnl(isBull, runtimeSignal.entry_price, closePrice);
                }

                // Persist to DB
                await (this.prisma as any).superEngulfingSignal.update({
                    where: { id: signal.id },
                    data: updateData,
                });

                return {
                    type: 'changed',
                    state: result.state,
                    result_type: result.result_type,
                    tp1_hit_now: result.tp1_hit && !signal.tp1_hit
                };
            }));

            // Track stats from batch
            for (const res of batchResults) {
                if (res.type === 'unchanged') {
                    unchanged++;
                    continue;
                }
                if (res.state === 'closed') {
                    if (res.result_type === 'tp3_full') tp3Hit++;
                    else if (res.result_type === 'tp2') tp2Hit++;
                    else if (res.result_type === 'tp1') tp1Hit++;
                    else if (res.result_type === 'sl') slHit++;
                    else if (res.result_type === 'candle_expiry') expired++;
                } else if (res.tp1_hit_now) {
                    tp1Hit++;
                }
            }
        }

        this.logger.log(
            `SE v3 Lifecycle complete: ${tp1Hit} TP1, ${tp2Hit} TP2, ${tp3Hit} TP3_FULL, ${slHit} SL, ${expired} EXPIRY, ${unchanged} unchanged.`
        );
    }

    private calcPnl(isBull: boolean, entry: number, exit: number): number {
        if (!entry) return 0;
        return isBull ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
    }
}
