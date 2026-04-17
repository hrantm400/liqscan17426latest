import { Injectable } from '@nestjs/common';
import { CandlesService } from '../../candles/candles.service';
import type { CandleData } from '../indicators';
import { detectCRT } from '../indicators';
import { getScannerCandles } from '../scanner-candles.helper';
import { saveScannerSignal } from '../scanner-persistence.helper';
import { SignalsService } from '../signals.service';

@Injectable()
export class CrtScanner {
    constructor(
        private readonly candlesService: CandlesService,
        private readonly signalsService: SignalsService,
    ) {}

    async scanFromCandles(symbol: string, timeframe: string, candles: CandleData[]): Promise<number> {
        const closedCandles = candles.slice(0, -1);

        if (closedCandles.length < 2) return 0;

        const sig = detectCRT(closedCandles);
        if (!sig) return 0;

        return saveScannerSignal(
            this.signalsService,
            'CRT',
            symbol,
            timeframe,
            sig.direction,
            sig.price,
            sig.time,
            {
                crt_direction: sig.direction === 'BUY' ? 'BULLISH' : 'BEARISH',
                swept_level: sig.sweptLevel,
                prev_high: sig.prevHigh,
                prev_low: sig.prevLow,
                sweep_extreme: sig.sweepExtreme,
            },
        );
    }

    async scan(symbol: string, timeframe: string): Promise<number> {
        const candles = await getScannerCandles(this.candlesService, symbol, timeframe);
        return this.scanFromCandles(symbol, timeframe, candles);
    }
}
