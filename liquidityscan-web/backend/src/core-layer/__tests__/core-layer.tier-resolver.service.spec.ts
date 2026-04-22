/**
 * CoreLayerTierResolverService — Phase 7.3 unit tests.
 *
 * The resolver is deliberately permissive on token inputs (we never
 * 401 a public Core-Layer read) and deliberately strict on the tier
 * decision (any failure mode downgrades to SCOUT). These tests pin
 * both contracts plus the 60s cache semantics.
 */

import { CoreLayerTierResolverService } from '../core-layer.tier-resolver.service';

class FakeJwt {
    verifyImpl: (token: string) => any = () => {
        throw new Error('not stubbed');
    };
    verify = jest.fn((token: string, _opts: any) => this.verifyImpl(token));
}

class FakeConfig {
    getOrThrow = jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        throw new Error(`unexpected config key: ${key}`);
    });
}

class FakePrisma {
    user = {
        findUnique: jest.fn(),
    };
}

class FakeAppConfig {
    getLaunchPromoFullAccess = jest.fn(async () => false);
}

function build(): {
    svc: CoreLayerTierResolverService;
    jwt: FakeJwt;
    prisma: FakePrisma;
    appConfig: FakeAppConfig;
} {
    const jwt = new FakeJwt();
    const prisma = new FakePrisma();
    const appConfig = new FakeAppConfig();
    const svc = new CoreLayerTierResolverService(
        jwt as any,
        new FakeConfig() as any,
        prisma as any,
        appConfig as any,
    );
    return { svc, jwt, prisma, appConfig };
}

describe('CoreLayerTierResolverService', () => {
    describe('anonymous / malformed headers', () => {
        it.each([
            ['undefined', undefined],
            ['empty string', ''],
            ['missing Bearer prefix', 'abc.def.ghi'],
            ['Bearer with empty token', 'Bearer   '],
        ])('returns SCOUT for %s', async (_label, header) => {
            const { svc } = build();
            await expect(svc.resolveFromAuthHeader(header as any)).resolves.toBe(
                'SCOUT',
            );
        });

        it('returns SCOUT when jwt.verify throws', async () => {
            const { svc, jwt } = build();
            jwt.verifyImpl = () => {
                throw new Error('expired');
            };
            await expect(
                svc.resolveFromAuthHeader('Bearer stale.token.here'),
            ).resolves.toBe('SCOUT');
        });
    });

    describe('authenticated resolution', () => {
        it('returns FULL_ACCESS for a user whose tier is not FREE', async () => {
            const { svc, jwt, prisma } = build();
            jwt.verifyImpl = () => ({ sub: 'user-1' });
            prisma.user.findUnique.mockResolvedValue({ tier: 'FULL_ACCESS' });

            await expect(
                svc.resolveFromAuthHeader('Bearer good.token'),
            ).resolves.toBe('FULL_ACCESS');
        });

        it('returns SCOUT for a FREE user when launch-promo is off', async () => {
            const { svc, jwt, prisma, appConfig } = build();
            jwt.verifyImpl = () => ({ sub: 'user-free' });
            prisma.user.findUnique.mockResolvedValue({ tier: 'FREE' });
            appConfig.getLaunchPromoFullAccess.mockResolvedValue(false);

            await expect(
                svc.resolveFromAuthHeader('Bearer free.token'),
            ).resolves.toBe('SCOUT');
        });

        it('returns FULL_ACCESS for a FREE user while launch-promo is on', async () => {
            const { svc, jwt, prisma, appConfig } = build();
            jwt.verifyImpl = () => ({ sub: 'user-free' });
            prisma.user.findUnique.mockResolvedValue({ tier: 'FREE' });
            appConfig.getLaunchPromoFullAccess.mockResolvedValue(true);

            await expect(
                svc.resolveFromAuthHeader('Bearer promo.token'),
            ).resolves.toBe('FULL_ACCESS');
        });

        it('returns SCOUT when the DB row is missing', async () => {
            const { svc, jwt, prisma } = build();
            jwt.verifyImpl = () => ({ sub: 'ghost' });
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                svc.resolveFromAuthHeader('Bearer ghost.token'),
            ).resolves.toBe('SCOUT');
        });

        it('fails closed to SCOUT on DB error', async () => {
            const { svc, jwt, prisma } = build();
            jwt.verifyImpl = () => ({ sub: 'user-err' });
            prisma.user.findUnique.mockRejectedValue(new Error('db down'));

            await expect(
                svc.resolveFromAuthHeader('Bearer any.token'),
            ).resolves.toBe('SCOUT');
        });
    });

    describe('caching', () => {
        it('memoizes per-user decisions inside the TTL window', async () => {
            const { svc, jwt, prisma } = build();
            jwt.verifyImpl = () => ({ sub: 'user-cache' });
            prisma.user.findUnique.mockResolvedValue({ tier: 'FULL_ACCESS' });

            await svc.resolveFromAuthHeader('Bearer t1');
            await svc.resolveFromAuthHeader('Bearer t1');
            await svc.resolveFromAuthHeader('Bearer t1');

            expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
        });

        it('refreshes the decision after invalidation', async () => {
            const { svc, jwt, prisma } = build();
            jwt.verifyImpl = () => ({ sub: 'user-cache' });
            prisma.user.findUnique.mockResolvedValue({ tier: 'FULL_ACCESS' });

            await svc.resolveFromAuthHeader('Bearer t1');
            svc.invalidateCacheForTesting();
            await svc.resolveFromAuthHeader('Bearer t1');

            expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
        });
    });
});
