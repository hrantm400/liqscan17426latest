import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

// Thresholds per strategy for extended scanning (if needed). Assuming standard thresholds for SE
const STRATEGY_CONFIG: Record<string, { tpPercent: number; slPercent: number; expiryCandleCount: number }> = {
    SUPER_ENGULFING: { tpPercent: 3.0, slPercent: 2.0, expiryCandleCount: 20 },
    ICT_BIAS: { tpPercent: 2.5, slPercent: 1.5, expiryCandleCount: 15 },
    RSI_DIVERGENCE: { tpPercent: 4.0, slPercent: 2.5, expiryCandleCount: 25 },
    STRATEGY_1: { tpPercent: 3.0, slPercent: 2.0, expiryCandleCount: 20 }, // Added strategy 1 fallback
};

const TF_MS: Record<string, number> = {
    '5m': 300000,
    '15m': 900000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000,
    '1w': 604800000,
};

interface BinanceTicker {
    symbol: string;
    price: string;
}

@Injectable()
export class LifecycleService implements OnModuleInit {
    private readonly logger = new Logger(LifecycleService.name);
    private intervalRef: ReturnType<typeof setInterval> | null = null;

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
        setInterval(() => this.deleteExpiredSeSignals(), 15 * 60 * 1000);
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

            if (result.count > 0) {
                this.logger.log(`SE v2 Delete Job: Permanently deleted ${result.count} expired signals.`);
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
            // LEGACY: Process non-SE signals that still use old lifecycle
            // ============================
            const legacySignals = await (this.prisma as any).superEngulfingSignal.findMany({
                where: {
                    strategyType: { not: 'SUPER_ENGULFING' },
                    lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
                },
            });

            if (legacySignals.length > 0) {
                this.logger.log(`Legacy lifecycle check: processing ${legacySignals.length} non-SE signals...`);
            }

            // ============================
            // ICT BIAS LIFECYCLE — Next Candle Body Close Validation
            // ============================
            const biasSignals = await (this.prisma as any).superEngulfingSignal.findMany({
                where: {
                    strategyType: 'ICT_BIAS',
                    lifecycleStatus: 'PENDING',
                    bias_level: { not: null },
                    bias_direction: { not: null },
                },
            });

            let biasWin = 0, biasFailed = 0;

            for (const bias of biasSignals) {
                try {
                    // Get the latest closed candles for this TF
                    const tfCandles = await this.candlesService.getKlines(bias.symbol, bias.timeframe, 5);
                    if (tfCandles.length < 2) continue;

                    // The bias was detected at bias.detectedAt — we need the NEXT closed candle after that
                    const biasDetectedMs = new Date(bias.detectedAt).getTime();
                    const tfMs = TF_MS[bias.timeframe] || 14400000;

                    // Find the first candle that opened AFTER the bias detection
                    const nextCandle = tfCandles.find(c => {
                        const candleOpenMs = new Date(c.openTime).getTime();
                        return candleOpenMs >= biasDetectedMs;
                    });

                    if (!nextCandle) continue; // Next candle hasn't formed yet

                    // Check if this candle is CLOSED (its open time + TF duration < now)
                    const candleCloseMs = new Date(nextCandle.openTime).getTime() + tfMs;
                    if (candleCloseMs > Date.now()) continue; // Still forming, wait

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
                    await this.stateService.transitionSignal(bias.id, SignalStatus.COMPLETED, {
                        result: signalResult,
                        closedPrice: nextClose,
                        pnlPercent: this.calcPnl(bias.bias_direction === 'BULL', bias.bias_level, nextClose),
                    });

                    await (this.prisma as any).superEngulfingSignal.update({
                        where: { id: bias.id },
                        data: {
                            bias_result: result,
                            bias_validated_at: new Date(),
                            closedAt: new Date(),
                            se_close_price: nextClose,
                        },
                    });

                    if (result === 'WIN') biasWin++;
                    else biasFailed++;
                } catch (err) {
                    this.logger.error(`Bias lifecycle error for ${bias.id}: ${err}`);
                }
            }

            if (biasSignals.length > 0) {
                this.logger.log(`Bias Lifecycle: ${biasWin} WIN, ${biasFailed} FAILED out of ${biasSignals.length} pending.`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Lifecycle check failed: ${msg}`);
        }
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

        const now = new Date();
        let tp1Hit = 0, tp2Hit = 0, slHit = 0, expired = 0, unchanged = 0;

        for (const signal of liveSeSignals) {
            const currentPrice = priceMap.get(signal.symbol);
            if (currentPrice === undefined) {
                unchanged++;
                continue;
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
                state: signal.state as 'live' | 'closed',
                tp1_hit: signal.tp1_hit ?? signal.se_r_ratio_hit ?? false,
                tp2_hit: signal.tp2_hit ?? false,
                result_v2: signal.result_v2 ?? null,
                result_type: signal.result_type ?? null,
                candle_count: candleInfo.isCandleClose ? candleInfo.actualCandleCount - 1 : candleInfo.actualCandleCount,
                max_candles: signal.max_candles ?? 10,
                triggered_at: triggeredAt,
                closed_at_v2: signal.closed_at_v2 ?? null,
                delete_at: signal.delete_at ?? null,
            };

            // Process signal using the v2 runtime
            const result = processSeSignal(runtimeSignal, {
                currentPrice,
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
                unchanged++;
                continue;
            }

            // Prepare update data
            const updateData: any = {};

            // V2 fields
            if (result.state !== undefined) updateData.state = result.state;
            if (result.tp1_hit !== undefined) updateData.tp1_hit = result.tp1_hit;
            if (result.tp2_hit !== undefined) updateData.tp2_hit = result.tp2_hit;
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
                updateData.se_close_price = currentPrice;
                
                // Map result_type to legacy se_close_reason
                if (result.result_type === 'tp2_full') {
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

                // Calculate PNL
                const isBull = runtimeSignal.direction_v2 === 'bullish';
                updateData.pnlPercent = this.calcPnl(isBull, runtimeSignal.entry_price, currentPrice);
            }

            // Persist to DB
            await (this.prisma as any).superEngulfingSignal.update({
                where: { id: signal.id },
                data: updateData,
            });

            // Track stats
            if (result.state === 'closed') {
                if (result.result_type === 'tp2_full') tp2Hit++;
                else if (result.result_type === 'tp1') tp1Hit++;
                else if (result.result_type === 'sl') slHit++;
                else if (result.result_type === 'candle_expiry') expired++;
            } else if (result.tp1_hit && !signal.tp1_hit) {
                tp1Hit++; // Partial - TP1 hit but not closed
            }
        }

        this.logger.log(
            `SE v2 Lifecycle complete: ${tp1Hit} TP1, ${tp2Hit} TP2_FULL, ${slHit} SL, ${expired} EXPIRY, ${unchanged} unchanged.`
        );
    }

    private calcPnl(isBull: boolean, entry: number, exit: number): number {
        if (!entry) return 0;
        return isBull ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
    }
}
