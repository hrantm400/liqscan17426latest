import type { SignalsService } from './signals.service';

/**
 * Persist a generic scanner signal and archive older rows for the same strategy+symbol+timeframe.
 */
export async function saveScannerSignal(
    signalsService: SignalsService,
    strategyType: string,
    symbol: string,
    timeframe: string,
    signalType: string,
    price: number,
    detectedAt: number,
    metadata?: Record<string, unknown>,
): Promise<number> {
    const id = `${strategyType}-${symbol}-${timeframe}-${detectedAt}`;

    const input = {
        id,
        strategyType,
        symbol,
        timeframe,
        signalType,
        price,
        detectedAt: new Date(detectedAt).toISOString(),
        lifecycleStatus: 'PENDING',
        metadata,
    };

    const added = await signalsService.addSignals([input]);

    if (added > 0) {
        signalsService.archiveOldSignals(strategyType, symbol, timeframe).catch(() => {});
    }

    return added;
}
