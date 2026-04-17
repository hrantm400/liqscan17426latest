import { ScannerService } from './scanner.service';

async function main() {
    console.log("Measuring RSIDivergence save signal logic...");

    // Create a mock SignalsService
    const mockSignalsService = {
        addSignals: async (inputs: any[]) => {
            return inputs.length;
        },
        archiveOldSignals: async (type: string, sym: string, tf: string) => {
            return 0;
        }
    };

    // Create a mock ScannerService with only the relevant parts
    class MockScannerService {
        private signalsService: any;
        constructor() {
            this.signalsService = mockSignalsService;
        }

        private async saveSignal(
            strategyType: string,
            symbol: string,
            timeframe: string,
            signalType: string,
            price: number,
            detectedAt: number,
            metadata?: Record<string, any>,
        ) {
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
                status: 'PENDING',
                metadata,
            };

            const added = await this.signalsService.addSignals([input]);

            if (added > 0) {
                this.signalsService.archiveOldSignals(strategyType, symbol, timeframe)
                    .catch(() => { });
            }

            return added;
        }

        async runBenchmarkSequential(numSignals: number) {
            let added = 0;
            const start = performance.now();
            for (let i = 0; i < numSignals; i++) {
                await this.saveSignal('RSIDIVERGENCE', 'BTCUSDT', '1h', 'BUY', 50000, 1600000000000 + i);
                added++;
            }
            const end = performance.now();
            return { time: end - start, added };
        }

        async runBenchmarkBatch(numSignals: number) {
            let added = 0;
            const start = performance.now();

            const inputs = [];
            for (let i = 0; i < numSignals; i++) {
                const detectedAt = 1600000000000 + i;
                inputs.push({
                    id: `RSIDIVERGENCE-BTCUSDT-1h-${detectedAt}`,
                    strategyType: 'RSIDIVERGENCE',
                    symbol: 'BTCUSDT',
                    timeframe: '1h',
                    signalType: 'BUY',
                    price: 50000,
                    detectedAt: new Date(detectedAt).toISOString(),
                    lifecycleStatus: 'PENDING',
                    status: 'PENDING',
                    metadata: {}
                });
            }

            if (inputs.length > 0) {
                added = await this.signalsService.addSignals(inputs);
                if (added > 0) {
                    this.signalsService.archiveOldSignals('RSIDIVERGENCE', 'BTCUSDT', '1h').catch(() => {});
                }
            }

            const end = performance.now();
            return { time: end - start, added };
        }
    }

    const scanner = new MockScannerService();
    const NUM_SIGNALS = 1000;

    const seqRes = await scanner.runBenchmarkSequential(NUM_SIGNALS);
    console.log(`Sequential: ${seqRes.time.toFixed(2)} ms for ${seqRes.added} signals`);

    const batchRes = await scanner.runBenchmarkBatch(NUM_SIGNALS);
    console.log(`Batch: ${batchRes.time.toFixed(2)} ms for ${batchRes.added} signals`);
}

main().catch(console.error);
