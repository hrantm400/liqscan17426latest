jest.mock('../telegram/telegram.service', () => ({
    TelegramService: class TelegramService {
        sendSignalAlert = jest.fn();
    },
}));

import { RsiDivergenceScanner } from './scanners/rsi-divergence.scanner';
import {
    SignalsService,
    RSI_STALE_MAX_CANDLES,
    SIGNAL_TIMEFRAME_MS,
} from './signals.service';
import * as indicators from './indicators';
import * as candleHelper from './scanner-candles.helper';
import type { CandleData } from './indicators/candle-types';

jest.mock('./scanner-candles.helper');

function makeCandles(count: number): CandleData[] {
    const base = 1_700_000_000_000;
    return Array.from({ length: count }, (_, i) => ({
        openTime: base + i * 60_000,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1,
    }));
}

describe('RSI Divergence lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('RsiDivergenceScanner', () => {
        it('persists and passes detected ids to closeStaleRsiSignals', async () => {
            const closedLen = 50;
            const candles = makeCandles(closedLen + 1);
            jest.mocked(candleHelper.getScannerCandles).mockResolvedValue(candles);

            const closed = candles.slice(0, -1);
            const lbR = 1;
            const latestPivotIndex = closed.length - 1 - lbR;
            const pivotTime = candles[latestPivotIndex].openTime;
            const div = {
                type: 'bullish-divergence' as const,
                barIndex: latestPivotIndex,
                time: pivotTime,
                rsiValue: 28,
                price: 98,
                prevBarIndex: 40,
                prevRsiValue: 22,
                prevPrice: 99,
            };
            jest.spyOn(indicators, 'detectRSIDivergence').mockReturnValue([div]);

            const addSignals = jest.fn().mockResolvedValue(1);
            const closeStaleRsiSignals = jest.fn().mockResolvedValue(undefined);
            const scanner = new RsiDivergenceScanner({} as any, {
                addSignals,
                closeStaleRsiSignals,
            } as any);

            await scanner.scan('TESTUSDT', '1h', { lbR: 1, lbL: 5 });

            const expectedId = `RSIDIVERGENCE-TESTUSDT-1h-${pivotTime}`;
            expect(addSignals).toHaveBeenCalled();
            expect(closeStaleRsiSignals).toHaveBeenCalledWith('TESTUSDT', '1h', [expectedId]);
            const row = addSignals.mock.calls[0][0][0];
            expect(row.metadata.prevBarIndex).toBe(40);
            expect(row.detectedAt).toBe(new Date(pivotTime).toISOString());
            expect(row.strategyType).toBe('RSIDIVERGENCE');
        });

        it('still calls addSignals when divergence pivot is not the latestPivotIndex bar', async () => {
            const candles = makeCandles(52);
            jest.mocked(candleHelper.getScannerCandles).mockResolvedValue(candles);
            const closed = candles.slice(0, -1);
            const olderIdx = closed.length - 6;
            const olderTime = candles[olderIdx].openTime;
            jest.spyOn(indicators, 'detectRSIDivergence').mockReturnValue([
                {
                    type: 'bullish-divergence' as const,
                    barIndex: olderIdx,
                    time: olderTime,
                    rsiValue: 28,
                    price: 98,
                    prevBarIndex: 10,
                    prevRsiValue: 22,
                    prevPrice: 99,
                },
            ]);

            const addSignals = jest.fn().mockResolvedValue(1);
            const closeStaleRsiSignals = jest.fn().mockResolvedValue(undefined);
            const scanner = new RsiDivergenceScanner({} as any, {
                addSignals,
                closeStaleRsiSignals,
            } as any);

            await scanner.scan('COINUSDT', '1h', { lbR: 1, lbL: 5 });

            expect(addSignals).toHaveBeenCalled();
            const row = addSignals.mock.calls[0][0][0];
            expect(row.id).toBe(`RSIDIVERGENCE-COINUSDT-1h-${olderTime}`);
            expect(closeStaleRsiSignals).toHaveBeenCalledWith('COINUSDT', '1h', [
                `RSIDIVERGENCE-COINUSDT-1h-${olderTime}`,
            ]);
        });

        it('awaits closeStaleRsiSignals after addSignals', async () => {
            const candles = makeCandles(40);
            jest.mocked(candleHelper.getScannerCandles).mockResolvedValue(candles);
            const closed = candles.slice(0, -1);
            const latestPivotIndex = closed.length - 1 - 1;
            jest.spyOn(indicators, 'detectRSIDivergence').mockReturnValue([
                {
                    type: 'bullish-divergence',
                    barIndex: latestPivotIndex,
                    time: candles[latestPivotIndex].openTime,
                    rsiValue: 30,
                    price: 99,
                    prevBarIndex: 10,
                    prevRsiValue: 25,
                    prevPrice: 100,
                },
            ]);

            const addSignals = jest.fn().mockResolvedValue(1);
            const closeStaleRsiSignals = jest.fn().mockResolvedValue(undefined);

            const scanner = new RsiDivergenceScanner({} as any, {
                addSignals,
                closeStaleRsiSignals,
            } as any);

            await scanner.scan('X', '1h', {});
            expect(addSignals).toHaveBeenCalled();
            expect(closeStaleRsiSignals).toHaveBeenCalled();
        });

        it('uses only closed candles (slice drops forming bar)', async () => {
            const candles = makeCandles(35);
            jest.mocked(candleHelper.getScannerCandles).mockResolvedValue(candles);
            const spy = jest.spyOn(indicators, 'detectRSIDivergence').mockReturnValue([]);

            const scanner = new RsiDivergenceScanner({} as any, {
                addSignals: jest.fn().mockResolvedValue(0),
                closeStaleRsiSignals: jest.fn().mockResolvedValue(undefined),
            } as any);

            await scanner.scan('Y', '4h', {});
            expect(spy).toHaveBeenCalled();
            const passed = spy.mock.calls[0][0] as CandleData[];
            expect(passed.length).toBe(candles.length - 1);
        });

        it('propagates when closeStaleRsiSignals rejects', async () => {
            const candles = makeCandles(51);
            jest.mocked(candleHelper.getScannerCandles).mockResolvedValue(candles);
            const closed = candles.slice(0, -1);
            const latestPivotIndex = closed.length - 1 - 1;
            jest.spyOn(indicators, 'detectRSIDivergence').mockReturnValue([
                {
                    type: 'bullish-divergence',
                    barIndex: latestPivotIndex,
                    time: candles[latestPivotIndex].openTime,
                    rsiValue: 30,
                    price: 99,
                    prevBarIndex: 15,
                    prevRsiValue: 25,
                    prevPrice: 100,
                },
            ]);
            const addSignals = jest.fn().mockResolvedValue(1);
            const closeStaleRsiSignals = jest.fn().mockRejectedValue(new Error('db'));
            const scanner = new RsiDivergenceScanner({} as any, {
                addSignals,
                closeStaleRsiSignals,
            } as any);

            await expect(scanner.scan('Z', '1h', {})).rejects.toThrow('db');
        });
    });

    describe('SignalsService.closeStaleRsiSignals', () => {
        it('first updateMany closes rows older than 15 candles for RSIDIVERGENCE', async () => {
            const updateMany = jest.fn().mockResolvedValue({ count: 1 });
            const deleteMany = jest.fn().mockResolvedValue({ count: 0 });

            const prisma = {
                superEngulfingSignal: { updateMany, deleteMany },
            };

            const service = new SignalsService(prisma as any, {} as any, {} as any);
            await service.closeStaleRsiSignals('BTCUSDT', '1h', ['RSIDIVERGENCE-BTCUSDT-1h-111']);

            expect(updateMany).toHaveBeenCalledTimes(2);
            expect(updateMany.mock.calls[0][0]).toEqual(
                expect.objectContaining({
                    where: {
                        strategyType: 'RSIDIVERGENCE',
                        symbol: 'BTCUSDT',
                        timeframe: '1h',
                        lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
                        detectedAt: { lt: expect.any(Date) },
                    },
                    data: expect.objectContaining({
                        lifecycleStatus: 'COMPLETED',
                        status: 'CLOSED',
                    }),
                }),
            );
            expect(deleteMany).toHaveBeenCalled();
        });

        it('second updateMany uses id notIn confirmed set', async () => {
            const updateMany = jest.fn().mockResolvedValue({ count: 0 });
            const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
            const prisma = {
                superEngulfingSignal: { updateMany, deleteMany },
            };
            const service = new SignalsService(prisma as any, {} as any, {} as any);
            await service.closeStaleRsiSignals('ETHUSDT', '4h', ['RSIDIVERGENCE-ETHUSDT-4h-999']);

            const patternWhere = updateMany.mock.calls[1][0].where;
            expect(patternWhere.strategyType).toEqual('RSIDIVERGENCE');
            expect(patternWhere.id).toEqual({
                notIn: expect.arrayContaining([
                    'RSIDIVERGENCE-ETHUSDT-4h-999',
                ]),
            });
            expect((patternWhere.id as { notIn: string[] }).notIn).toHaveLength(1);
        });

        it('does not run pattern close when scan returns no ids (only age + delete)', async () => {
            const updateMany = jest.fn().mockResolvedValue({ count: 0 });
            const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
            const prisma = {
                superEngulfingSignal: { updateMany, deleteMany },
            };
            const service = new SignalsService(prisma as any, {} as any, {} as any);
            await service.closeStaleRsiSignals('ETHUSDT', '4h', []);

            expect(updateMany).toHaveBeenCalledTimes(1);
            expect(updateMany.mock.calls[0][0].where.detectedAt).toEqual({ lt: expect.any(Date) });
        });

        it('deleteMany removes COMPLETED RSIDIVERGENCE older than 24h', async () => {
            const updateMany = jest.fn().mockResolvedValue({ count: 0 });
            const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
            const prisma = {
                superEngulfingSignal: { updateMany, deleteMany },
            };
            const service = new SignalsService(prisma as any, {} as any, {} as any);
            await service.closeStaleRsiSignals('Z', '1d', ['x']);

            expect(deleteMany).toHaveBeenCalledWith({
                where: expect.objectContaining({
                    strategyType: 'RSIDIVERGENCE',
                    symbol: 'Z',
                    timeframe: '1d',
                    lifecycleStatus: 'COMPLETED',
                    closedAt: { lt: expect.any(Date) },
                }),
            });
        });
    });

    describe('RSI_STALE_MAX_CANDLES', () => {
        it('matches 15 * timeframe ms used in expiryThreshold', () => {
            expect(RSI_STALE_MAX_CANDLES).toBe(15);
            const tf = '1h';
            const ms = SIGNAL_TIMEFRAME_MS[tf];
            expect(ms).toBe(3_600_000);
        });
    });
});
