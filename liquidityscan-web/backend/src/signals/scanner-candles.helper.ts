import type { CandlesService } from '../candles/candles.service';
import type { CandleData } from './indicators';

/**
 * Fetch klines mapped to CandleData (default 120; RSI divergence may request more).
 */
export async function getScannerCandles(
    candlesService: CandlesService,
    symbol: string,
    interval: string,
    _limit = 120,
): Promise<CandleData[]> {
    const klines = await candlesService.getKlines(symbol, interval, 500);
    return klines.map((k) => ({
        openTime: k.openTime,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
    }));
}
