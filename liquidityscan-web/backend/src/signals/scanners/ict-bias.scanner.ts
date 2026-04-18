import { Injectable, Logger } from '@nestjs/common';
import { CandlesService } from '../../candles/candles.service';
import type { CandleData } from '../indicators';
import { detectICTBias } from '../indicators';
import { getScannerCandles } from '../scanner-candles.helper';
import { SignalsService } from '../signals.service';
import { BinanceWsManager } from '../../candles/binance-ws.manager';

@Injectable()
export class IctBiasScanner {
    private readonly logger = new Logger(IctBiasScanner.name);

    constructor(
        private readonly candlesService: CandlesService,
        private readonly signalsService: SignalsService,
        private readonly wsManager: BinanceWsManager,
    ) {}

    async scanFromCandles(symbol: string, timeframe: string, candles: CandleData[]): Promise<number> {
        if (candles.length < 2) return 0;

        const sig = detectICTBias(candles);
        if (!sig || sig.bias === 'RANGING') return 0;

        const signalType = sig.direction === 'NEUTRAL' ? 'BUY' : sig.direction;
        const biasDirection = sig.bias === 'BULLISH' ? 'BULL' : 'BEAR';
        const biasLevel = candles[candles.length - 2].close;

        const id = `ICT_BIAS-${symbol}-${timeframe}-${sig.time}`;
        // Option A: no scanner-side close of prior rows — LifecycleService owns WIN/FAILED and STUCK_EXPIRED only.
        return this.signalsService.addSignals([
            {
                id,
                strategyType: 'ICT_BIAS',
                symbol,
                timeframe,
                signalType,
                price: candles[candles.length - 1].close,
                detectedAt: new Date(sig.time).toISOString(),
                lifecycleStatus: 'ACTIVE',
                metadata: {
                    bias: sig.bias,
                    prevHigh: sig.prevHigh,
                    prevLow: sig.prevLow,
                    bias_direction: biasDirection,
                    bias_level: biasLevel,
                },
            },
        ]);
    }

    async scan(symbol: string, timeframe: string): Promise<number> {
        const candles = await getScannerCandles(this.candlesService, symbol, timeframe);
        return this.scanFromCandles(symbol, timeframe, candles);
    }

    /**
     * Live ICT bias for all unique ICT_BIAS symbols in DB for this timeframe (cached 60s at orchestrator).
     */
    async computeLiveBias(
        timeframe: string,
    ): Promise<Record<string, { bias: string; prevHigh: number; prevLow: number; direction: string }>> {
        let symbols: string[] = [];
        try {
            symbols = await this.signalsService.getDistinctSymbolsByStrategy('ICT_BIAS', timeframe);
        } catch (err) {
            this.logger.error(`Failed to query ICT_BIAS symbols: ${err}`);
            return {};
        }

        const maxSymbols = Math.max(
            32,
            Math.min(2000, Number(process.env.LIVE_BIAS_MAX_SYMBOLS) || 450),
        );
        if (symbols.length > maxSymbols) {
            this.logger.warn(
                `[LiveBias] Capping symbols ${symbols.length} → ${maxSymbols} (set LIVE_BIAS_MAX_SYMBOLS to adjust)`,
            );
            symbols = symbols.slice(0, maxSymbols);
        }

        if (symbols.length === 0) return {};

        this.logger.log(`[LiveBias] Computing live ${timeframe} bias for ${symbols.length} symbols...`);

        const CONCURRENCY = 10;
        const result: Record<string, { bias: string; prevHigh: number; prevLow: number; direction: string }> = {};

        for (let i = 0; i < symbols.length; i += CONCURRENCY) {
            const batch = symbols.slice(i, i + CONCURRENCY);
            const promises = batch.map(async (symbol) => {
                try {
                    let candles: CandleData[];
                    
                    if (this.wsManager.isReady()) {
                        candles = this.wsManager.getCandlesSlice(symbol, timeframe, 5);
                    } else {
                        const klines = await this.candlesService.getKlines(symbol, timeframe, 5);
                        candles = klines.map((k) => ({
                            openTime: k.openTime,
                            open: k.open,
                            high: k.high,
                            low: k.low,
                            close: k.close,
                            volume: k.volume,
                        }));
                    }
                    
                    if (!candles || candles.length < 2) return;
                    const sig = detectICTBias(candles);
                    if (sig) {
                        result[symbol] = {
                            bias: sig.bias,
                            prevHigh: sig.prevHigh,
                            prevLow: sig.prevLow,
                            direction: sig.direction,
                        };
                    }
                } catch (err) {
                    this.logger.warn(`[LiveBias] Failed for ${symbol}: ${err}`);
                }
            });
            await Promise.all(promises);
        }

        this.logger.log(`[LiveBias] Cached ${Object.keys(result).length} results for ${timeframe}`);

        return result;
    }
}
