import { CoreLayerDetectionService } from '../core-layer.detection.service';
import { CoreLayerLifecycleService } from '../core-layer.lifecycle.service';
import { normalizeTimeframe, TF_CANDLE_MS } from '../core-layer.constants';
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

    // Default detectedAt is back-dated by one TF interval so the stored close
    // (detectedAt + TF_CANDLE_MS[tf], per PR-A) lands exactly at anchorNow.
    // This keeps the §4 temporal-coherence gate happy: every TF in a default-
    // seeded multi-TF chain has the same stored close, so no bucket TF is
    // "stale" relative to another. Tests that care about expiry pass an
    // explicit detectedAt override.
    function defaultDetectedAt(timeframe: string): Date {
        const tf = normalizeTimeframe(timeframe);
        return new Date(anchorNow - (tf ? TF_CANDLE_MS[tf] : 60_000));
    }
    function seedRow(overrides: Partial<Record<string, any>>) {
        const timeframe = (overrides.timeframe ?? '1d') as string;
        prisma.superEngulfingSignal.rows.push({
            id: overrides.id ?? `row-${prisma.superEngulfingSignal.rows.length}`,
            strategyType: 'SUPER_ENGULFING',
            symbol: 'BTCUSDT',
            timeframe: '1d',
            signalType: 'BUY',
            lifecycleStatus: 'ACTIVE',
            detectedAt: defaultDetectedAt(timeframe),
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

    describe('tfLastCandleClose field semantics', () => {
        // Scanner rows' `detectedAt` equals the signal candle's OPEN time (see
        // super-engulfing.detect.ts / crt.detect.ts / ict-bias.detect.ts — all
        // emit `time: curr.openTime`). `collapseToChains` must store the CLOSE
        // time (openTime + interval) in `tfLastCandleClose`, so life-state
        // math and the frontend's `targetOpen = signalCloseMs - intervalMs`
        // arrow lookup both resolve to the actual signal candle.
        it.each([
            ['1w', 'W' as const],
            ['1d', '1D' as const],
            ['4h', '4H' as const],
            ['1h', '1H' as const],
            ['15m', '15m' as const],
            ['5m', '5m' as const],
        ])(
            '%s scanner row → stored close = detectedAt + TF_CANDLE_MS[%s]',
            async (timeframe, tf) => {
                // Pair each TF with a second TF that gives a chain of length ≥ 2
                // with a valid anchor, so the bucket survives classifyAnchor and
                // reaches upsertChain. Back-date both detectedAts by one TF
                // interval each so the stored closes land at anchorNow and the
                // §4 temporal-coherence gate keeps both TFs.
                const partnerTf = tf === 'W' ? '1d' : '1w';
                const partnerNormalized = tf === 'W' ? '1D' : 'W';
                const partnerDetectedAt = new Date(
                    anchorNow - TF_CANDLE_MS[partnerNormalized],
                );
                const targetDetectedAt = new Date(anchorNow - TF_CANDLE_MS[tf]);
                seedRow({
                    id: `partner-${timeframe}`,
                    timeframe: partnerTf,
                    detectedAt: partnerDetectedAt,
                });
                seedRow({
                    id: `target-${timeframe}`,
                    timeframe,
                    detectedAt: targetDetectedAt,
                });

                await service.runDetection(anchorNow);

                const row = prisma.coreLayerSignal.rows[0];
                expect(row).toBeTruthy();
                const stored = row.tfLastCandleClose as Record<string, number>;
                expect(stored[tf]).toBe(targetDetectedAt.getTime() + TF_CANDLE_MS[tf]);
            },
        );

        it('regression: TACUSDT CRT SELL 1H — frontend arrow lookup now resolves to the signal candle', async () => {
            // Fixture captured from prod on 2026-04-23 (see §6 diagnostic). Before the
            // fix, the arrow rendered on the candle at openTime = signalOpenTime - 1h
            // because the frontend did `targetOpen = signalCloseMs - intervalMs` but
            // `signalCloseMs` was actually an open time.
            const signalCandleOpenTime = 1776924000000; // 2026-04-23 06:00:00 UTC
            const oneHourMs = TF_CANDLE_MS['1H'];
            const detectedAt = new Date(signalCandleOpenTime); // scanner writes openTime as detectedAt

            // Seed CRT SELL chain on W + 1H (the actual chain shape from prod).
            prisma.superEngulfingSignal.rows.push({
                id: 'crt-w',
                strategyType: 'CRT',
                symbol: 'TACUSDT',
                timeframe: '1w',
                signalType: 'SELL',
                lifecycleStatus: 'ACTIVE',
                detectedAt: new Date(1776038400000),
                pattern_v2: null,
            });
            prisma.superEngulfingSignal.rows.push({
                id: 'crt-1h',
                strategyType: 'CRT',
                symbol: 'TACUSDT',
                timeframe: '1h',
                signalType: 'SELL',
                lifecycleStatus: 'ACTIVE',
                detectedAt,
                pattern_v2: null,
            });

            await service.runDetection(signalCandleOpenTime + oneHourMs);

            const row = prisma.coreLayerSignal.rows[0];
            expect(row).toBeTruthy();
            const stored = row.tfLastCandleClose as Record<string, number>;
            const signalCloseMs = stored['1H'];

            // Frontend's arrow-placement math (CoreLayerChart.tsx) computes:
            //   targetOpen = signalCloseMs - intervalMs
            // and picks the candle whose openTime matches that. Under the fix,
            // that value now equals the signal candle's openTime — the arrow
            // lands on the actual signal bar, not the bar before it.
            expect(signalCloseMs - oneHourMs).toBe(signalCandleOpenTime);
        });
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
        // 4H scanner row is 5 candles old → after +candleMs close-time offset its
        // stored close is 4 candles old → dt > 3 × candleMs → `isTfExpired` true.
        seedRow({ id: 'u3', timeframe: '4h', detectedAt: new Date(anchorNow - 5 * TF_CANDLE_MS['4H']) });

        const result = await service.runDetection(anchorNow);
        expect(result.demoted).toBeGreaterThanOrEqual(1);
    });
});
