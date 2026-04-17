import { TronScannerService } from './src/payments/tron-scanner.service';
import { PrismaService } from './src/prisma/prisma.service';
import { PaymentsService } from './src/payments/payments.service';

const mockPrisma = {
    payment: {
        findMany: async () => {
            const payments = [];
            for (let i = 0; i < 500; i++) {
                payments.push({
                    id: i.toString(),
                    amount: 10 + i,
                    createdAt: new Date(),
                    status: 'pending',
                    paymentMethod: 'crypto_trc20'
                });
            }
            return payments;
        },
        update: async () => {
            return new Promise(resolve => setTimeout(resolve, 10)); // Simulate 10ms DB update
        }
    }
} as any;

const mockPaymentsService = {
    processSubscriptionPayment: async () => {
        return new Promise(resolve => setTimeout(resolve, 20)); // Simulate 20ms service call
    }
} as any;

process.env.TRC20_WALLET_ADDRESS = 'mock_wallet';

const service = new TronScannerService(mockPrisma as PrismaService, mockPaymentsService as PaymentsService);
// Override fetch to return mock transactions
(global as any).fetch = async () => {
    return {
        ok: true,
        json: async () => {
            const data = [];
            for (let i = 0; i < 500; i++) {
                data.push({
                    transaction_id: `tx_${i}`,
                    value: (10 + i) * 1000000,
                    to: process.env.TRC20_WALLET_ADDRESS || 'mock_wallet',
                    block_timestamp: Date.now()
                });
            }
            return { data };
        }
    } as any;
};

// @ts-ignore
service['logger'] = { log: () => {}, warn: () => {}, error: () => {} } as any;

async function runBenchmark() {
    // Warmup
    await service.scanForPayments();

    const start = Date.now();
    await service.scanForPayments();
    const end = Date.now();

    console.log(`Scan took ${end - start}ms`);
}

runBenchmark().catch(console.error);
