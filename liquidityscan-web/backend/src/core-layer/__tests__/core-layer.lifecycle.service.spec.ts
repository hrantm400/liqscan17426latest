import { CoreLayerLifecycleService } from '../core-layer.lifecycle.service';
import { TF_CANDLE_MS } from '../core-layer.constants';
import { FakePrismaService } from './fake-prisma';

/**
 * Integration-style tests for the lifecycle service.
 *
 * Uses FakePrismaService so transitions are observable through the same DB
 * surface the service writes to — no jest.fn() per-call mocking, which would
 * over-specify the implementation.
 */
describe('CoreLayerLifecycleService', () => {
    let prisma: FakePrismaService;
    let service: CoreLayerLifecycleService;
    const anchorNow = Date.UTC(2026, 3, 22, 12, 0, 0);

    beforeEach(() => {
        prisma = new FakePrismaService();
        service = new CoreLayerLifecycleService(prisma as any);
    });

    describe('upsertChain', () => {
        it('creates a new ACTIVE row with one "created" history entry', async () => {
            const outcome = await service.upsertChain({
                pair: 'BTCUSDT',
                variant: 'SE',
                direction: 'BUY',
                chain: ['W', '1D', '4H'],
                tfLastCandleClose: {
                    W: anchorNow - TF_CANDLE_MS.W / 2,
                    '1D': anchorNow - TF_CANDLE_MS['1D'] / 2,
                    '4H': anchorNow - TF_CANDLE_MS['4H'] / 2,
                },
                sePerTf: { W: 'REV+', '1D': 'REV+', '4H': 'REV' },
                now: anchorNow,
            });

            expect(outcome).toBe('created');
            expect(prisma.coreLayerSignal.rows).toHaveLength(1);
            const row = prisma.coreLayerSignal.rows[0];
            expect(row.pair).toBe('BTCUSDT');
            expect(row.variant).toBe('SE');
            expect(row.anchor).toBe('WEEKLY');
            expect(row.chain).toEqual(['W', '1D', '4H']);
            expect(row.depth).toBe(3);
            expect(row.status).toBe('ACTIVE');
            expect(row.plusSummary).toBe('dominant');

            expect(prisma.coreLayerHistoryEntry.rows).toHaveLength(1);
            const hist = prisma.coreLayerHistoryEntry.rows[0];
            expect(hist.signalId).toBe(row.id);
            expect(hist.event).toBe('created');
            expect(hist.toDepth).toBe(3);
            expect(hist.toAnchor).toBe('WEEKLY');
        });

        it('promotes an existing chain when a new TF joins', async () => {
            await service.upsertChain({
                pair: 'ETHUSDT',
                variant: 'CRT',
                direction: 'SELL',
                chain: ['1D', '4H'],
                tfLastCandleClose: {
                    '1D': anchorNow - 1_000,
                    '4H': anchorNow - 1_000,
                },
                now: anchorNow,
            });
            const later = anchorNow + 60 * 60 * 1000;
            const outcome = await service.upsertChain({
                pair: 'ETHUSDT',
                variant: 'CRT',
                direction: 'SELL',
                chain: ['1D', '4H', '1H'],
                tfLastCandleClose: {
                    '1D': later - 1_000,
                    '4H': later - 1_000,
                    '1H': later - 1_000,
                },
                now: later,
            });

            expect(outcome).toBe('promoted');
            expect(prisma.coreLayerSignal.rows).toHaveLength(1);
            const row = prisma.coreLayerSignal.rows[0];
            expect(row.depth).toBe(3);
            expect(row.chain).toEqual(['1D', '4H', '1H']);

            const events = prisma.coreLayerHistoryEntry.rows.filter(
                (h) => h.signalId === row.id,
            );
            expect(events.map((e) => e.event)).toEqual(['created', 'promoted']);
            const promoted = events[1];
            expect(promoted.fromDepth).toBe(2);
            expect(promoted.toDepth).toBe(3);
            expect(promoted.tfAdded).toBe('1H');
        });

        it('records an anchor_changed event when anchor flips at the same depth', async () => {
            // Start with W+1D → WEEKLY anchor
            await service.upsertChain({
                pair: 'SOLUSDT',
                variant: 'SE',
                direction: 'BUY',
                chain: ['W', '1D'],
                tfLastCandleClose: { W: anchorNow, '1D': anchorNow },
                now: anchorNow,
            });
            // Next pass: W dropped, 4H gained → still 2-deep, anchor DAILY
            const outcome = await service.upsertChain({
                pair: 'SOLUSDT',
                variant: 'SE',
                direction: 'BUY',
                chain: ['1D', '4H'],
                tfLastCandleClose: { '1D': anchorNow + 1, '4H': anchorNow + 1 },
                now: anchorNow + 1,
            });
            expect(outcome).toBe('anchor_changed');
            const row = prisma.coreLayerSignal.rows[0];
            expect(row.anchor).toBe('DAILY');
            expect(row.depth).toBe(2);
            const events = prisma.coreLayerHistoryEntry.rows;
            expect(events[events.length - 1].event).toBe('anchor_changed');
            expect(events[events.length - 1].fromAnchor).toBe('WEEKLY');
            expect(events[events.length - 1].toAnchor).toBe('DAILY');
        });
    });

    describe('advanceLifecycles', () => {
        it('drops an expired TF and writes a demoted history row', async () => {
            await service.upsertChain({
                pair: 'BTCUSDT',
                variant: 'SE',
                direction: 'BUY',
                chain: ['W', '1D', '4H'],
                tfLastCandleClose: {
                    W: anchorNow,
                    '1D': anchorNow,
                    // 4H is already stale by 4 candles — should drop on sweep
                    '4H': anchorNow - 4 * TF_CANDLE_MS['4H'],
                },
                now: anchorNow,
            });

            const result = await service.advanceLifecycles(anchorNow);
            expect(result.demoted).toBe(1);
            expect(result.closed).toBe(0);

            const row = prisma.coreLayerSignal.rows[0];
            expect(row.status).toBe('ACTIVE');
            expect(row.chain).toEqual(['W', '1D']);
            expect(row.depth).toBe(2);
            expect(row.anchor).toBe('WEEKLY');

            const demote = prisma.coreLayerHistoryEntry.rows.find((h) => h.event === 'demoted');
            expect(demote).toBeTruthy();
            expect(demote!.tfRemoved).toBe('4H');
        });

        it('closes the chain when it falls below two TFs', async () => {
            await service.upsertChain({
                pair: 'XRPUSDT',
                variant: 'BIAS',
                direction: 'BUY',
                chain: ['1D', '4H'],
                tfLastCandleClose: {
                    '1D': anchorNow,
                    '4H': anchorNow - 4 * TF_CANDLE_MS['4H'], // stale
                },
                now: anchorNow,
            });

            const result = await service.advanceLifecycles(anchorNow);
            expect(result.closed).toBe(1);
            const row = prisma.coreLayerSignal.rows[0];
            expect(row.status).toBe('CLOSED');
            expect(row.closedAt).toBeInstanceOf(Date);
            const closeEvt = prisma.coreLayerHistoryEntry.rows.find((h) => h.event === 'closed');
            expect(closeEvt).toBeTruthy();
            expect(closeEvt!.toDepth).toBe(0);
        });
    });

    describe('advanceLifecyclesForPairs (scoped sub-hour sweep)', () => {
        it('demotes an expired LTF only on pairs inside the scope', async () => {
            // Target pair: a 4H chain with a 15m TF that's 4 candles stale.
            // The dispatcher only knows about pairs that just closed a sub-hour
            // candle, so only this pair should be swept. Using FOURHOUR anchor
            // (1H-only / sub-hour-only chains lack a valid anchor per
            // classifyAnchor).
            await service.upsertChain({
                pair: 'ETHUSDT',
                variant: 'SE',
                direction: 'BUY',
                chain: ['4H', '15m'],
                tfLastCandleClose: {
                    '4H': anchorNow,
                    '15m': anchorNow - 4 * TF_CANDLE_MS['15m'], // dt = 4 candles, past the 3-candle threshold
                },
                now: anchorNow,
            });
            // Control pair: same stale shape but NOT in the flush scope. Must
            // be left untouched — the hourly cron owns it.
            await service.upsertChain({
                pair: 'SOLUSDT',
                variant: 'SE',
                direction: 'BUY',
                chain: ['4H', '15m'],
                tfLastCandleClose: {
                    '4H': anchorNow,
                    '15m': anchorNow - 4 * TF_CANDLE_MS['15m'],
                },
                now: anchorNow,
            });

            const result = await service.advanceLifecyclesForPairs(['ETHUSDT'], anchorNow);
            expect(result.closed).toBe(1); // ETHUSDT chain collapses below 2 TFs

            const eth = prisma.coreLayerSignal.rows.find((r) => r.pair === 'ETHUSDT')!;
            expect(eth.status).toBe('CLOSED');
            expect(eth.closedAt).toBeInstanceOf(Date);

            const sol = prisma.coreLayerSignal.rows.find((r) => r.pair === 'SOLUSDT')!;
            expect(sol.status).toBe('ACTIVE');
            expect(sol.chain).toEqual(['4H', '15m']);
        });

        it('is a no-op when the pairs array is empty', async () => {
            // Even if there is an ACTIVE row that WOULD be demoted, an empty
            // scope must not touch the DB.
            await service.upsertChain({
                pair: 'BTCUSDT',
                variant: 'SE',
                direction: 'BUY',
                chain: ['4H', '15m'],
                tfLastCandleClose: {
                    '4H': anchorNow,
                    '15m': anchorNow - 4 * TF_CANDLE_MS['15m'],
                },
                now: anchorNow,
            });

            const result = await service.advanceLifecyclesForPairs([], anchorNow);
            expect(result).toEqual({ demoted: 0, anchorChanged: 0, closed: 0 });

            const btc = prisma.coreLayerSignal.rows[0];
            expect(btc.status).toBe('ACTIVE');
            expect(btc.chain).toEqual(['4H', '15m']);
        });
    });
});
