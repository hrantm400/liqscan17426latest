import { CoreLayerDetectionService } from '../core-layer.detection.service';
import { CoreLayerLifecycleService } from '../core-layer.lifecycle.service';
import { TF_CANDLE_MS } from '../core-layer.constants';
import { FakePrismaService } from './fake-prisma';

/**
 * Integration-style tests for the detection service. Uses real
 * CoreLayerLifecycleService on top of the in-memory Prisma fake so the full
 * write path (read upstream → collapse → upsert → history) is exercised.
 */
describe('CoreLayerDetectionService', () => {
    let prisma: FakePrismaService;
    let lifecycle: CoreLayerLifecycleService;
    let service: CoreLayerDetectionService;
    const anchorNow = Date.UTC(2026, 3, 22, 12, 0, 0);

    beforeEach(() => {
        prisma = new FakePrismaService();
        lifecycle = new CoreLayerLifecycleService(prisma as any);
        service = new CoreLayerDetectionService(prisma as any, lifecycle);
    });

    function seedRow(overrides: Partial<Record<string, any>>) {
        prisma.superEngulfingSignal.rows.push({
            id: overrides.id ?? `row-${prisma.superEngulfingSignal.rows.length}`,
            strategyType: 'SUPER_ENGULFING',
            symbol: 'BTCUSDT',
            timeframe: '1d',
            signalType: 'BUY',
            lifecycleStatus: 'ACTIVE',
            detectedAt: new Date(anchorNow - 60_000),
            pattern_v2: 'REV_PLUS_BULLISH',
            ...overrides,
        });
    }

    it('builds a chain from two+ TF rows of the same variant/pair/direction', async () => {
        seedRow({ id: 'a', timeframe: '1w', pattern_v2: 'RUN_PLUS_BULLISH' });
        seedRow({ id: 'b', timeframe: '1d' });
        seedRow({ id: 'c', timeframe: '4h', pattern_v2: 'REV_BULLISH' });

        const result = await service.runDetection(anchorNow);

        expect(result.created).toBe(1);
        expect(prisma.coreLayerSignal.rows).toHaveLength(1);
        const row = prisma.coreLayerSignal.rows[0];
        expect(row.pair).toBe('BTCUSDT');
        expect(row.variant).toBe('SE');
        expect(row.direction).toBe('BUY');
        expect(row.chain).toEqual(['W', '1D', '4H']);
        expect(row.anchor).toBe('WEEKLY');
        // SE variant captures per-TF pattern kind from pattern_v2.
        expect(row.sePerTf).toMatchObject({ W: 'RUN+', '1D': 'REV+', '4H': 'REV' });
        expect(row.plusSummary).toBe('dominant');
    });

    it('skips single-TF groups (chain.size < 2) and anchor-less combos', async () => {
        seedRow({ id: 'single', timeframe: '1d', symbol: 'ETHUSDT' });
        seedRow({ id: 'weekly-only', timeframe: '1w', symbol: 'SOLUSDT' });
        // A 1H-only row — not enough TFs, no anchor anyway
        seedRow({ id: 'lonely', timeframe: '1h', symbol: 'XRPUSDT' });

        const result = await service.runDetection(anchorNow);
        expect(result.created).toBe(0);
        expect(prisma.coreLayerSignal.rows).toHaveLength(0);
    });

    it('separates BUY vs SELL groups even for the same symbol', async () => {
        seedRow({ id: 'buy1d', timeframe: '1d', signalType: 'BUY' });
        seedRow({ id: 'buy4h', timeframe: '4h', signalType: 'BUY' });
        seedRow({ id: 'sell1d', timeframe: '1d', signalType: 'SELL' });
        seedRow({ id: 'sell4h', timeframe: '4h', signalType: 'SELL' });

        const result = await service.runDetection(anchorNow);
        expect(result.created).toBe(2);
        const dirs = prisma.coreLayerSignal.rows.map((r) => r.direction).sort();
        expect(dirs).toEqual(['BUY', 'SELL']);
    });

    it('closes ACTIVE Core-Layer chains that no longer have upstream signals', async () => {
        // Seed an existing ACTIVE Core-Layer row with no matching upstream rows.
        prisma.coreLayerSignal.rows.push({
            id: 'orphan',
            pair: 'DOGEUSDT',
            variant: 'SE',
            direction: 'BUY',
            anchor: 'DAILY',
            chain: ['1D', '4H'],
            depth: 2,
            correlationPairs: [],
            tfLifeState: {},
            tfLastCandleClose: { '1D': anchorNow, '4H': anchorNow },
            status: 'ACTIVE',
            detectedAt: new Date(anchorNow - 86_400_000),
            lastPromotedAt: new Date(anchorNow - 86_400_000),
            createdAt: new Date(anchorNow - 86_400_000),
            updatedAt: new Date(anchorNow - 86_400_000),
        });

        const result = await service.runDetection(anchorNow);
        expect(result.closed).toBeGreaterThanOrEqual(1);
        const row = prisma.coreLayerSignal.rows[0];
        expect(row.status).toBe('CLOSED');
        expect(row.closedAt).toBeInstanceOf(Date);
        const closeEvt = prisma.coreLayerHistoryEntry.rows.find(
            (h) => h.signalId === 'orphan' && h.event === 'closed',
        );
        expect(closeEvt).toBeTruthy();
    });

    it('maps ICT_BIAS strategyType to BIAS variant and accepts BULLISH/BEARISH direction strings', async () => {
        seedRow({
            id: 'b1',
            strategyType: 'ICT_BIAS',
            timeframe: '1d',
            signalType: 'BULLISH',
            pattern_v2: null,
        });
        seedRow({
            id: 'b2',
            strategyType: 'ICT_BIAS',
            timeframe: '4h',
            signalType: 'BULLISH',
            pattern_v2: null,
        });

        const result = await service.runDetection(anchorNow);
        expect(result.created).toBe(1);
        const row = prisma.coreLayerSignal.rows[0];
        expect(row.variant).toBe('BIAS');
        expect(row.direction).toBe('BUY');
        // Non-SE variants never compute plusSummary — the lifecycle service sets it to null.
        expect(row.plusSummary).toBeNull();
    });

    it('demotes during the advanceLifecycles second-pass when upstream TFs aged out silently', async () => {
        // Seed an ACTIVE Core-Layer row whose 4H close is already stale.
        prisma.coreLayerSignal.rows.push({
            id: 'stale',
            pair: 'BTCUSDT',
            variant: 'SE',
            direction: 'BUY',
            anchor: 'WEEKLY',
            chain: ['W', '1D', '4H'],
            depth: 3,
            correlationPairs: [],
            tfLifeState: {},
            tfLastCandleClose: {
                W: anchorNow,
                '1D': anchorNow,
                '4H': anchorNow - 4 * TF_CANDLE_MS['4H'],
            },
            status: 'ACTIVE',
            detectedAt: new Date(anchorNow),
            lastPromotedAt: new Date(anchorNow),
            createdAt: new Date(anchorNow),
            updatedAt: new Date(anchorNow),
        });
        // Seed matching upstream so the orphan-close branch does not fire first.
        seedRow({ id: 'u1', timeframe: '1w' });
        seedRow({ id: 'u2', timeframe: '1d' });
        seedRow({ id: 'u3', timeframe: '4h', detectedAt: new Date(anchorNow - 4 * TF_CANDLE_MS['4H']) });

        const result = await service.runDetection(anchorNow);
        expect(result.demoted).toBeGreaterThanOrEqual(1);
    });
});
