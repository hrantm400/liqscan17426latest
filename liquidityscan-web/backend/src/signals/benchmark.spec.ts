import { SuperEngulfingScanner } from './scanners/super-engulfing.scanner';

jest.mock('../telegram/telegram.service', () => {
    return {
        TelegramService: jest.fn().mockImplementation(() => {
            return {
                sendPhoto: jest.fn(),
                sendMessage: jest.fn()
            };
        })
    };
});

// We want to mock detectSuperEngulfing to return multiple signals to trigger the loop
jest.mock('./indicators', () => ({
  ...jest.requireActual('./indicators'),
  detectSuperEngulfing: jest.fn().mockReturnValue(Array(50).fill({
    pattern_v2: 'TEST', time: 1234, direction: 'BUY', price: 10, pattern: 'TEST',
    type: 'TEST', entryZone: [10, 20], sl: 5, tp1: 15, tp2: 20, entry_price: 10,
    sl_price: 5, tp1_price: 15, tp2_price: 20, tp3_price: 25, candle_high: 20, candle_low: 5
  }))
}));

describe('ScannerService Benchmark', () => {
  it('should measure checkSuperEngulfing performance', async () => {
    // We will create a mock service to test checkSuperEngulfing
    const mockCandlesService = {
      getKlines: jest.fn().mockResolvedValue(Array(50).fill({
        openTime: 1, open: 10, high: 20, low: 5, close: 15, volume: 100
      }))
    };


    const mockSignalsService = {
      addSignals: jest.fn().mockImplementation(async (inputs) => {
        // Mock a slight delay like a real db query would have
        await new Promise(r => setTimeout(r, 10));
        return inputs.length;
      })
    };

    const scanner = new SuperEngulfingScanner(mockCandlesService as any, mockSignalsService as any);

    const start = process.hrtime.bigint();
    await scanner.scan('BTCUSDT', '4h');
    const end = process.hrtime.bigint();

    console.log(`SuperEngulfingScanner.scan took ${Number(end - start) / 1e6} ms`);

    // verify the number of calls to addSignals
    console.log(`addSignals was called ${mockSignalsService.addSignals.mock.calls.length} times`);
  });
});
