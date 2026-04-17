import { Injectable } from '@nestjs/common';
import { CandlesService } from '../../candles/candles.service';
import type { CandleData } from '../indicators';
import { detect3OB } from '../indicators';
import { getScannerCandles } from '../scanner-candles.helper';
import { SignalsService } from '../signals.service';

@Injectable()
export class ThreeOBScanner {
    constructor(
        private readonly candlesService: CandlesService,
        private readonly signalsService: SignalsService,
    ) {}

    async scanFromCandles(symbol: string, timeframe: string, candles: CandleData[]): Promise<number> {
        const closedCandles = candles.slice(0, -1);
        if (closedCandles.length < 3) return 0;

        const sig = detect3OB(closedCandles);
        if (!sig) return 0;

        const id = `3OB-${symbol}-${timeframe}-${sig.time}`;

        const inputs = [
            {
                id,
                strategyType: '3OB' as const,
                symbol,
                timeframe,
                signalType: sig.direction,
                price: sig.price,
                detectedAt: new Date(sig.time).toISOString(),
                lifecycleStatus: 'ACTIVE',
                status: 'ACTIVE',
                metadata: {
                    direction3ob: sig.direction === 'BUY' ? 'BULLISH' : 'BEARISH',
                    lowestlow: sig.lowestLow,
                    highesthigh: sig.highestHigh,
                    c1high: sig.c1High,
                    c1low: sig.c1Low,
                    c2open: sig.c2Open,
                    c2close: sig.c2Close,
                    c1open: sig.c1Open,
                    c1close: sig.c1Close,
                    c0open: sig.c0Open,
                    c0close: sig.c0Close,
                },
            },
        ];

        const added = await this.signalsService.addSignals(inputs);
        if (added > 0) {
            this.signalsService.archiveOldSignals('3OB', symbol, timeframe).catch(() => {});
        }
        return added;
    }

    async scan(symbol: string, timeframe: string): Promise<number> {
        const candles = await getScannerCandles(this.candlesService, symbol, timeframe);
        return this.scanFromCandles(symbol, timeframe, candles);
    }
}
