import { Injectable, Logger } from '@nestjs/common';
import { CandlesService } from '../../candles/candles.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CandleData } from '../indicators';
import { detectAllMSS } from '../indicators';
import { getScannerCandles } from '../scanner-candles.helper';
import { SignalsService } from '../signals.service';
import { AppConfigService } from '../../app-config/app-config.service';

const MAX_ACTIVE_CISD = 3;
const CISD_KLINE_LIMIT = 200;

@Injectable()
export class CisdScanner {
    private readonly logger = new Logger(CisdScanner.name);

    constructor(
        private readonly candlesService: CandlesService,
        private readonly signalsService: SignalsService,
        private readonly prisma: PrismaService,
        private readonly appConfig: AppConfigService,
    ) {}

    async scanFromCandles(symbol: string, timeframe: string, candles: CandleData[]): Promise<number> {
        const closedCandles = candles.slice(0, -1);
        if (closedCandles.length < 60) return 0;

        const config = await this.appConfig.getConfig();
        const cisdOptions = {
            lbLeft: config.cisdPivotLeft,
            lbRight: config.cisdPivotRight,
            minSeq: config.cisdMinConsecutive,
        };

        const allSigs = detectAllMSS(closedCandles, cisdOptions);
        if (allSigs.length === 0) return 0;

        const latestOpenTime = closedCandles[closedCandles.length - 1].openTime;
        let inserted = 0;
        let loggedActive = false;

        for (const sig of allSigs) {
            const id = `CISD-${symbol}-${timeframe}-${sig.time}`;
            const existing = await (this.prisma as any).superEngulfingSignal.findUnique({ where: { id } });
            if (existing) continue;

            const cisdDirection = sig.direction === 'BUY' ? 'BULL' : 'BEAR';
            const mssLabel =
                sig.mssType === 'HIGH_PROB_MSS'
                    ? 'High Prob MSS'
                    : sig.mssType === 'TRAP_MSS'
                      ? 'Trap MSS'
                      : 'MSS';
            const isLatestBar = sig.time === latestOpenTime;

            if (isLatestBar) {
                await this.enforceMaxActive(symbol, timeframe);
            }

            const pivotCandle = closedCandles[sig.pivotBarIndex];
            const nowIso = new Date().toISOString();
            const baseMeta = {
                text: `CISD ${cisdDirection} ${mssLabel} level=${sig.mssLevel} Fib50=${sig.fib50}`,
                cisd_direction: cisdDirection,
                mss_type: sig.mssType,
                mss_label: `${cisdDirection === 'BULL' ? 'Bull' : 'Bear'} ${mssLabel}`,
                mss_level: sig.mssLevel,
                fib_50: sig.fib50,
                pivot_price: sig.pivotPrice,
                pivot_bar_index: sig.pivotBarIndex,
                pivot_time: pivotCandle?.openTime ?? sig.time,
                has_fvg: sig.hasFvg,
                fvg_high: sig.fvgHigh,
                fvg_low: sig.fvgLow,
                fvg_start_time: sig.fvgStartTime,
                proximity_upper: sig.proximityUpper,
                proximity_lower: sig.proximityLower,
                reverse_candle_high: pivotCandle?.high ?? sig.mssLevel,
                reverse_candle_low: pivotCandle?.low ?? sig.mssLevel,
                reverse_candle_time: sig.revCandleTime,
                chart_marker: true,
                historical_window: !isLatestBar,
            };

            const count = await this.signalsService.addSignals([
                isLatestBar
                    ? {
                          id,
                          strategyType: 'CISD',
                          symbol,
                          timeframe,
                          signalType: sig.direction,
                          price: sig.price,
                          detectedAt: new Date(sig.time).toISOString(),
                          lifecycleStatus: 'ACTIVE',
                          metadata: baseMeta,
                      }
                    : {
                          id,
                          strategyType: 'CISD',
                          symbol,
                          timeframe,
                          signalType: sig.direction,
                          price: sig.price,
                          detectedAt: new Date(sig.time).toISOString(),
                          lifecycleStatus: 'COMPLETED',
                          status: 'CLOSED',
                          closedAt: nowIso,
                          suppressTelegramAlert: true,
                          metadata: {
                              ...baseMeta,
                              se_close_reason: 'HISTORICAL_BAR',
                          },
                      },
            ]);

            inserted += count;
            if (count > 0 && isLatestBar) {
                loggedActive = true;
                this.logger.log(
                    `CISD ${sig.direction} ${sig.mssType}: ${symbol} ${timeframe} | mss=${sig.mssLevel} fib50=${sig.fib50} fvg=${sig.hasFvg}`,
                );
            }
        }

        if (inserted > 1 || (inserted === 1 && !loggedActive)) {
            this.logger.log(
                `CISD window: ${symbol} ${timeframe} inserted ${inserted} marker(s) (${allSigs.length} in window)`,
            );
        }

        return inserted;
    }

    async scan(symbol: string, timeframe: string): Promise<number> {
        const candles = await getScannerCandles(
            this.candlesService,
            symbol,
            timeframe,
            CISD_KLINE_LIMIT,
        );
        return this.scanFromCandles(symbol, timeframe, candles);
    }

    private async enforceMaxActive(symbol: string, timeframe: string): Promise<void> {
        const active = await (this.prisma as any).superEngulfingSignal.findMany({
            where: {
                strategyType: 'CISD',
                symbol,
                timeframe,
                lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
            },
            orderBy: { detectedAt: 'asc' },
        });

        if (active.length < MAX_ACTIVE_CISD) return;

        const toInvalidate = active.slice(0, active.length - MAX_ACTIVE_CISD + 1);

        for (const signal of toInvalidate) {
            try {
                await (this.prisma as any).superEngulfingSignal.update({
                    where: { id: signal.id },
                    data: {
                        lifecycleStatus: 'EXPIRED',
                        status: 'EXPIRED',
                        closedAt: new Date(),
                        se_close_reason: 'INVALIDATED',
                    },
                });

                this.logger.log(`CISD invalidated (cap=3): ${signal.id}`);
            } catch (err) {
                this.logger.error(`CISD invalidate error for ${signal.id}: ${err}`);
            }
        }
    }
}
