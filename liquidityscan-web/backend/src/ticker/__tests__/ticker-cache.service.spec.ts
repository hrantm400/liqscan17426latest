import { TickerCacheService } from '../ticker-cache.service';
import type { IExchangeProvider, IKline, ITicker24h } from '../../providers/data-provider.interface';

/**
 * Tests for {@link TickerCacheService}. We pass a fake IExchangeProvider
 * so the cache exercises its refresh / lookup / failure-handling logic
 * without touching the network.
 */

type ProviderCall = { count: number };

function makeProvider(
    resolver: () => Promise<Map<string, ITicker24h>>,
    call: ProviderCall = { count: 0 },
): IExchangeProvider {
    return {
        fetchSymbols: async () => [],
        getKlines: async (): Promise<IKline[]> => [],
        getCurrentPrices: async () => new Map(),
        get24hVolumes: async () => new Map(),
        async get24hTickers() {
            call.count += 1;
            return resolver();
        },
    };
}

describe('TickerCacheService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('seeds cache on refresh and exposes live lookups', async () => {
        const provider = makeProvider(async () =>
            new Map([
                ['BTCUSDT', { price: 70_000, change24h: 1.23 }],
                ['ETHUSDT', { price: 3_500, change24h: -0.5 }],
            ]),
        );
        const svc = new TickerCacheService(provider);

        await svc.refresh();

        expect(svc.size()).toBe(2);
        expect(svc.get('BTCUSDT')).toEqual({ price: 70_000, change24h: 1.23 });
        expect(svc.get('ETHUSDT')).toEqual({ price: 3_500, change24h: -0.5 });
    });

    it('returns null for symbols absent from the snapshot', async () => {
        const provider = makeProvider(async () =>
            new Map([['BTCUSDT', { price: 1, change24h: 0 }]]),
        );
        const svc = new TickerCacheService(provider);
        await svc.refresh();

        expect(svc.get('PEPEUSDT')).toBeNull();
    });

    it('returns null before any refresh has landed', () => {
        const provider = makeProvider(async () => new Map());
        const svc = new TickerCacheService(provider);
        expect(svc.get('BTCUSDT')).toBeNull();
        expect(svc.ageMs()).toBeNull();
    });

    it('keeps previous snapshot when upstream returns empty', async () => {
        let returnEmpty = false;
        const provider = makeProvider(async () =>
            returnEmpty
                ? new Map()
                : new Map([['BTCUSDT', { price: 70_000, change24h: 1.0 }]]),
        );
        const svc = new TickerCacheService(provider);

        await svc.refresh();
        expect(svc.get('BTCUSDT')?.price).toBe(70_000);

        returnEmpty = true;
        await svc.refresh();

        // Empty upstream must not wipe the cache — we keep the last known good snapshot.
        expect(svc.get('BTCUSDT')?.price).toBe(70_000);
        expect(svc.size()).toBe(1);
    });

    it('keeps previous snapshot when upstream throws and captures to Sentry', async () => {
        const sentry = require('@sentry/node');
        const captureSpy = jest.spyOn(sentry, 'captureException').mockImplementation(() => 'evt');
        const scopeSpy = jest.spyOn(sentry, 'withScope').mockImplementation((cb: any) =>
            cb({ setTag: jest.fn(), setLevel: jest.fn() }),
        );

        let shouldThrow = false;
        const provider = makeProvider(async () => {
            if (shouldThrow) throw new Error('boom');
            return new Map([['BTCUSDT', { price: 42, change24h: 0.5 }]]);
        });
        const svc = new TickerCacheService(provider);

        await svc.refresh();
        expect(svc.get('BTCUSDT')?.price).toBe(42);

        shouldThrow = true;
        await svc.refresh();

        expect(svc.get('BTCUSDT')?.price).toBe(42);
        expect(captureSpy).toHaveBeenCalledTimes(1);
        expect(scopeSpy).toHaveBeenCalled();
    });

    it('overlap guard — a second refresh in flight returns immediately', async () => {
        let resolveFirst: (v: Map<string, ITicker24h>) => void;
        const firstPromise = new Promise<Map<string, ITicker24h>>((resolve) => {
            resolveFirst = resolve;
        });
        const call = { count: 0 };
        const provider = makeProvider(() => firstPromise, call);
        const svc = new TickerCacheService(provider);

        const first = svc.refresh();
        // Kick off a second call while the first is pending.
        const second = svc.refresh();

        expect(call.count).toBe(1);
        resolveFirst!(new Map([['BTCUSDT', { price: 1, change24h: 0 }]]));
        await Promise.all([first, second]);

        expect(call.count).toBe(1);
        expect(svc.size()).toBe(1);
    });

    it('ageMs reports snapshot age after a successful refresh', async () => {
        const provider = makeProvider(async () =>
            new Map([['BTCUSDT', { price: 1, change24h: 0 }]]),
        );
        const svc = new TickerCacheService(provider);
        await svc.refresh();

        const age = svc.ageMs();
        expect(age).not.toBeNull();
        expect(age!).toBeGreaterThanOrEqual(0);
        expect(age!).toBeLessThan(1000);
    });
});
