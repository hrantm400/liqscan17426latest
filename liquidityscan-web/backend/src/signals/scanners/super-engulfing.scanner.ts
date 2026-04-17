import { Injectable } from '@nestjs/common';
import { CandlesService } from '../../candles/candles.service';
import type { CandleData } from '../indicators';
import { detectSuperEngulfing } from '../indicators';
import { getScannerCandles } from '../scanner-candles.helper';
import { getMaxCandlesForTimeframe } from '../se-runtime';
import { SignalsService } from '../signals.service';

/**
 * SE Scanner v2 — multiple live signals per symbol+timeframe allowed; pattern in id.
 */
@Injectable()
export class SuperEngulfingScanner {
    constructor(
        private readonly candlesService: CandlesService,
        private readonly signalsService: SignalsService,
    ) {}

    async scanFromCandles(symbol: string, timeframe: string, candles: CandleData[]): Promise<number> {
        const closedCandles = candles.slice(0, -1);

        if (closedCandles.length < 2) return 0;

        const confirmedSignals = detectSuperEngulfing(closedCandles);
        const max_candles = getMaxCandlesForTimeframe(timeframe);

        let added = 0;
        const inputs = [];
        for (const sig of confirmedSignals) {
            const id = `SUPER_ENGULFING-${symbol}-${timeframe}-${sig.pattern_v2}-${sig.time}`;

            inputs.push({
                id,
                strategyType: 'SUPER_ENGULFING' as const,
                symbol,
                timeframe,
                signalType: sig.direction,
                price: sig.price,
                detectedAt: new Date(sig.time).toISOString(),
                lifecycleStatus: 'ACTIVE',
                status: 'ACTIVE',
                metadata: {
                    pattern: sig.pattern,
                    type: sig.type,
                    direction: sig.direction === 'BUY' ? 'BULL' : 'BEAR',
                    se_entry_zone: sig.entryZone,
                    se_sl: sig.sl,
                    se_tp1: sig.tp1,
                    se_tp2: sig.tp2,
                    se_current_sl: sig.sl,
                    type_v2: 'se',
                    pattern_v2: sig.pattern_v2,
                    direction_v2: sig.direction_v2,
                    entry_price: sig.entry_price,
                    sl_price: sig.sl_price,
                    current_sl_price: sig.sl_price,
                    tp1_price: sig.tp1_price,
                    tp2_price: sig.tp2_price,
                    tp3_price: sig.tp3_price,
                    max_candles,
                    candle_high: sig.candle_high,
                    candle_low: sig.candle_low,
                },
            });
        }

        if (inputs.length > 0) {
            added = await this.signalsService.addSignals(inputs);
        }

        return added;
    }

    async scan(symbol: string, timeframe: string): Promise<number> {
        const candles = await getScannerCandles(this.candlesService, symbol, timeframe);
        return this.scanFromCandles(symbol, timeframe, candles);
    }
}
