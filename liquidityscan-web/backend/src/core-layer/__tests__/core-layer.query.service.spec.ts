/**
 * Query-service tests. Runtime flag is provided via a minimal fake that
 * exposes just `isEnabled()` — the query service only reads the flag, it
 * never writes or records telemetry through this dependency.
 */

import { CoreLayerQueryService } from '../core-layer.query.service';
import { TF_CANDLE_MS } from '../core-layer.constants';
import { FakePrismaService } from './fake-prisma';
import type { ITicker24h } from '../../providers/data-provider.interface';

/** Minimal in-memory stand-in for TickerCacheService used by the query path. */
class FakeTickerCache {
    private map = new Map<string, ITicker24h>();
    set(symbol: string, ticker: ITicker24h): void {
        this.map.set(symbol, ticker);
    }
    clear(): void {
        this.map.clear();
    }
    get(symbol: string): ITicker24h | null {
        return this.map.get(symbol) ?? null;
    }
}

class FakeRuntimeFlag {
    private enabled = true;
    setEnabledForTest(v: boolean): void {
        this.enabled = v;
    }
    isEnabled(): boolean {
        return this.enabled;
    }
}

describe('CoreLayerQueryService', () => {
    let prisma: FakePrismaService;
    let ticker: FakeTickerCache;
    let runtimeFlag: FakeRuntimeFlag;
    let service: CoreLayerQueryService;
    const now = Date.UTC(2026, 3, 22, 12, 0, 0);

    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(now));
    });
    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        prisma = new FakePrismaService();
        ticker = new FakeTickerCache();
        runtimeFlag = new FakeRuntimeFlag();
        service = new CoreLayerQueryService(
            prisma as any,
            ticker as any,
            runtimeFlag as any,
        );
        runtimeFlag.setEnabledForTest(true);
    });

    function seedSignal(overrides: Partial<Record<string, any>> = {}) {
        const defaults = {
            id: `sig-${prisma.coreLayerSignal.rows.length + 1}`,
            pair: 'BTCUSDT',
            variant: 'SE',
            direction: 'BUY',
            anchor: 'WEEKLY',
            chain: ['W', '1D', '4H'],
            depth: 3,
            correlationPairs: [],
            tfLifeState: { W: 'fresh', '1D': 'fresh', '4H': 'fresh' },
            tfLastCandleClose: {
                W: now - TF_CANDLE_MS.W / 4,
                '1D': now - TF_CANDLE_MS['1D'] / 4,
                '4H': now - TF_CANDLE_MS['4H'] / 4,
            },
            sePerTf: { W: 'REV+', '1D': 'REV+', '4H': 'REV' },
            plusSummary: 'dominant',
            status: 'ACTIVE',
            detectedAt: new Date(now - 3600_000),
            lastPromotedAt: new Date(now - 60_000),
            createdAt: new Date(now - 3600_000),
            updatedAt: new Date(now),
        };
        prisma.coreLayerSignal.rows.push({ ...defaults, ...overrides });
    }

    describe('flag off', () => {
        beforeEach(() => {
            runtimeFlag.setEnabledForTest(false);
        });
        it('returns empty + enabled:false for list', async () => {
            seedSignal();
            const res = await service.listSignals({});
            expect(res).toEqual({ signals: [], nextCursor: null, enabled: false });
        });
        it('returns null for getSignalById', async () => {
            seedSignal({ id: 'x' });
            expect(await service.getSignalById('x')).toBeNull();
        });
        it('returns zeroed stats with enabled:false', async () => {
            seedSignal();
            const s = await service.getStats();
            expect(s).toMatchObject({ total: 0, enabled: false });
            expect(Object.values(s.byVariant).every((n) => n === 0)).toBe(true);
        });
    });

    describe('HTF override', () => {
        it('forces W and 1D to steady while deriving non-HTF from close timestamps', async () => {
            seedSignal({
                id: 'htf',
                tfLastCandleClose: {
                    W: now - 1000, // very fresh
                    '1D': now - 1000, // very fresh
                    '4H': now - TF_CANDLE_MS['4H'] * 1.5, // within breathing window
                },
                tfLifeState: { W: 'fresh', '1D': 'fresh', '4H': 'breathing' },
            });

            const res = await service.listSignals({});
            expect(res.signals).toHaveLength(1);
            const dto = res.signals[0];
            expect(dto.tfLifeState.W).toBe('steady');
            expect(dto.tfLifeState['1D']).toBe('steady');
            expect(dto.tfLifeState['4H']).toBe('breathing');
        });

        it('recomputes non-HTF life state from stored closes on read', async () => {
            seedSignal({
                id: 'aged',
                tfLastCandleClose: {
                    '4H': now - 4 * TF_CANDLE_MS['4H'], // aged past breathing window
                    '1H': now - 10, // fresh
                },
                // Stored state is out-of-date — the query service must correct it at read time.
                tfLifeState: { '4H': 'fresh', '1H': 'fresh' },
                chain: ['4H', '1H'],
                anchor: 'FOURHOUR',
                depth: 2,
            });
            const dto = await service.getSignalById('aged');
            expect(dto!.tfLifeState['4H']).toBe('steady');
            expect(dto!.tfLifeState['1H']).toBe('fresh');
        });
    });

    describe('pagination', () => {
        it('returns a stable nextCursor and honors limit', async () => {
            for (let i = 0; i < 5; i++) {
                seedSignal({
                    id: `p${i}`,
                    lastPromotedAt: new Date(now - i * 60_000),
                });
            }
            const page1 = await service.listSignals({ limit: 2 });
            expect(page1.signals).toHaveLength(2);
            expect(page1.signals.map((s) => s.id)).toEqual(['p0', 'p1']);
            expect(page1.nextCursor).toBeTruthy();

            const page2 = await service.listSignals({ limit: 2, cursor: page1.nextCursor! });
            expect(page2.signals.map((s) => s.id)).toEqual(['p2', 'p3']);

            const page3 = await service.listSignals({ limit: 2, cursor: page2.nextCursor! });
            expect(page3.signals.map((s) => s.id)).toEqual(['p4']);
            expect(page3.nextCursor).toBeNull();
        });

        it('degrades to the first page on a malformed cursor instead of erroring', async () => {
            seedSignal({ id: 'only' });
            const res = await service.listSignals({ cursor: 'not-a-base64!' });
            // Malformed cursor → parser returns null → treat as no cursor → first page.
            expect(res.signals.map((s) => s.id)).toEqual(['only']);
        });
    });

    describe('pair filter', () => {
        it('returns only rows matching the pair filter', async () => {
            seedSignal({ id: 'btc', pair: 'BTCUSDT' });
            seedSignal({ id: 'eth', pair: 'ETHUSDT' });
            seedSignal({ id: 'btc-closed', pair: 'BTCUSDT', status: 'CLOSED' });

            const res = await service.listSignals({ pair: 'BTCUSDT' });
            expect(res.signals.map((s) => s.id)).toEqual(['btc']);

            const resClosed = await service.listSignals({ pair: 'BTCUSDT', status: 'CLOSED' });
            expect(resClosed.signals.map((s) => s.id)).toEqual(['btc-closed']);

            const resMissing = await service.listSignals({ pair: 'XRPUSDT' });
            expect(resMissing.signals).toEqual([]);
        });
    });

    describe('stats', () => {
        it('buckets by variant / anchor / depth for ACTIVE rows only', async () => {
            seedSignal({ id: 's-se', variant: 'SE', depth: 3, anchor: 'WEEKLY' });
            seedSignal({ id: 's-crt', variant: 'CRT', depth: 2, anchor: 'DAILY' });
            seedSignal({ id: 's-bias', variant: 'BIAS', depth: 2, anchor: 'DAILY' });
            seedSignal({ id: 's-closed', variant: 'SE', depth: 4, anchor: 'WEEKLY', status: 'CLOSED' });

            const s = await service.getStats();
            expect(s.total).toBe(3);
            expect(s.byVariant).toEqual({ SE: 1, CRT: 1, BIAS: 1 });
            expect(s.byAnchor).toEqual({ WEEKLY: 1, DAILY: 2, FOURHOUR: 0 });
            expect(s.byDepth['2']).toBe(2);
            expect(s.byDepth['3']).toBe(1);
            expect(s.byDepth['4']).toBeUndefined();
        });
    });

    describe('ticker enrichment', () => {
        it('populates price and change24h from the ticker cache when available', async () => {
            seedSignal({ id: 'btc', pair: 'BTCUSDT' });
            ticker.set('BTCUSDT', { price: 70_000.5, change24h: 1.23 });

            const res = await service.listSignals({});
            expect(res.signals[0].price).toBe(70_000.5);
            expect(res.signals[0].change24h).toBe(1.23);
        });

        it('falls back to 0 placeholders on cache miss', async () => {
            seedSignal({ id: 'obscure', pair: 'NOSUCHUSDT' });

            const res = await service.listSignals({});
            expect(res.signals[0].price).toBe(0);
            expect(res.signals[0].change24h).toBe(0);
        });

        it('enriches getSignalById responses too', async () => {
            seedSignal({ id: 'eth', pair: 'ETHUSDT' });
            ticker.set('ETHUSDT', { price: 3_456.78, change24h: -0.42 });

            const dto = await service.getSignalById('eth');
            expect(dto).not.toBeNull();
            expect(dto!.price).toBe(3_456.78);
            expect(dto!.change24h).toBe(-0.42);
        });
    });
});
