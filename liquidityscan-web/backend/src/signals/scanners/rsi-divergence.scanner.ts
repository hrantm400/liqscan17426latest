import { Injectable } from '@nestjs/common';
import { CandlesService } from '../../candles/candles.service';
import type { CandleData, RSIDivergenceConfig } from '../indicators';
import { detectRSIDivergence } from '../indicators';
import { getScannerCandles } from '../scanner-candles.helper';
import { SignalsService } from '../signals.service';

@Injectable()
export class RsiDivergenceScanner {
    constructor(
        private readonly candlesService: CandlesService,
        private readonly signalsService: SignalsService,
    ) {}

    /**
     * Run detection on a candle array (e.g. tests or WS snapshots). Same rules as {@link scan} except candles are provided.
     */
    async scanFromCandles(
        symbol: string,
        timeframe: string,
        candles: CandleData[],
        config: RSIDivergenceConfig = {},
    ): Promise<number> {
        const closedCandles = candles.slice(0, -1);
        if (closedCandles.length < 30) return 0;

        const signals = detectRSIDivergence(closedCandles, config);
        // Persist every divergence the detector returns (≤2). A strict "latest bar only" gate dropped almost
        // all inserts once a new candle shifted the window while the same divergence was still valid.

        const inputs = signals.map((signal) => {
            const id = `RSIDIVERGENCE-${symbol}-${timeframe}-${signal.time}`;
            return {
                id,
                strategyType: 'RSIDIVERGENCE' as const,
                symbol,
                timeframe,
                signalType: signal.type === 'bullish-divergence' ? ('BUY' as const) : ('SELL' as const),
                price: signal.price,
                detectedAt: new Date(signal.time).toISOString(),
                lifecycleStatus: 'ACTIVE' as const,
                metadata: {
                    divergenceType: signal.type,
                    rsiValue: signal.rsiValue,
                    prevRsiValue: signal.prevRsiValue,
                    prevPrice: signal.prevPrice,
                    prevBarIndex: signal.prevBarIndex,
                },
            };
        });

        let added = 0;
        if (inputs.length > 0) {
            added = await this.signalsService.addSignals(inputs);
        }

        const currentIds = signals.map((s) => `RSIDIVERGENCE-${symbol}-${timeframe}-${s.time}`);
        await this.signalsService.closeStaleRsiSignals(symbol, timeframe, currentIds);

        return added;
    }

    async scan(symbol: string, timeframe: string, config: RSIDivergenceConfig): Promise<number> {
        const candles = await getScannerCandles(this.candlesService, symbol, timeframe);
        return this.scanFromCandles(symbol, timeframe, candles, config);
    }
}
