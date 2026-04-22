import { CoreLayerAdminService } from '../core-layer.admin.service';
import type {
    CoreLayerRuntimeStatus,
    CoreLayerSubHourRuntimeStatus,
} from '../core-layer.runtime-flag.service';

/**
 * CoreLayerAdminService — unit tests.
 *
 * Exercises the three admin operations with hand-rolled fakes. The
 * service is a thin coordinator, so the tests mostly verify that:
 *   - stats rolls up the groupBy results in a stable order;
 *   - setEnabled returns the previous state and delegates correctly;
 *   - forceRescan wipes ACTIVE only and runs detection synchronously.
 */

class FakeRuntimeFlag {
    private enabled = true;
    private subHourEnabled = true;
    status: CoreLayerRuntimeStatus = {
        enabled: true,
        envSeed: true,
        lastSuccessfulTickAt: null,
        lastTickDurationMs: null,
        lastTickNumber: 0,
        consecutiveFailures: 0,
        recentErrors: [],
    };
    subHourStatus: CoreLayerSubHourRuntimeStatus = {
        enabled: true,
        envSeed: true,
        lastSuccessfulTickAt: null,
        lastTickDurationMs: null,
        lastTickNumber: 0,
        consecutiveFailures: 0,
        recentErrors: [],
        lastDirtyPairCount: null,
    };
    setEnabledMock = jest.fn(async (v: boolean, _actor?: string) => {
        this.enabled = v;
        this.status.enabled = v;
    });
    setSubHourEnabledMock = jest.fn(async (v: boolean, _actor?: string) => {
        this.subHourEnabled = v;
        this.subHourStatus.enabled = v;
    });
    isEnabled = () => this.enabled;
    isSubHourEnabled = () => this.subHourEnabled;
    getStatus = () => ({ ...this.status });
    getSubHourStatus = () => ({ ...this.subHourStatus });
    setEnabled = (v: boolean, actor?: string) => this.setEnabledMock(v, actor);
    setSubHourEnabled = (v: boolean, actor?: string) =>
        this.setSubHourEnabledMock(v, actor);
}

class FakeDetection {
    runDetection = jest.fn(async () => ({
        created: 3,
        promoted: 0,
        demoted: 0,
        anchorChanged: 0,
        closed: 0,
        scannedVariants: 3,
    }));
}

class FakeCoreLayerSignalDelegate {
    count = jest.fn(async () => 42);
    groupBy = jest.fn(async ({ by }: { by: string[] }) => {
        // Return a fixed deterministic shape keyed off the groupBy columns.
        if (by.length === 1 && by[0] === 'variant') {
            return [
                { variant: 'SE', _count: 10 },
                { variant: 'CRT', _count: 25 },
                { variant: 'BIAS', _count: 7 },
            ];
        }
        if (by.length === 1 && by[0] === 'anchor') {
            return [
                { anchor: 'WEEKLY', _count: 5 },
                { anchor: 'DAILY', _count: 30 },
                { anchor: 'FOURHOUR', _count: 7 },
            ];
        }
        if (by.length === 2) {
            // (variant, anchor)
            return [
                { variant: 'CRT', anchor: 'DAILY', _count: 20 },
                { variant: 'SE', anchor: 'WEEKLY', _count: 4 },
                { variant: 'BIAS', anchor: 'FOURHOUR', _count: 6 },
                { variant: 'SE', anchor: 'DAILY', _count: 6 },
                { variant: 'CRT', anchor: 'FOURHOUR', _count: 5 },
                { variant: 'BIAS', anchor: 'WEEKLY', _count: 1 },
            ];
        }
        return [];
    });
    deleteMany = jest.fn(async (_args: any) => ({ count: 17 }));
}

function build(): {
    svc: CoreLayerAdminService;
    prisma: any;
    flag: FakeRuntimeFlag;
    detection: FakeDetection;
    delegate: FakeCoreLayerSignalDelegate;
} {
    const delegate = new FakeCoreLayerSignalDelegate();
    const prisma = { coreLayerSignal: delegate } as any;
    const flag = new FakeRuntimeFlag();
    const detection = new FakeDetection();
    const svc = new CoreLayerAdminService(prisma, flag as any, detection as any);
    return { svc, prisma, flag, detection, delegate };
}

describe('CoreLayerAdminService', () => {
    describe('getStats', () => {
        it('fans out 4 queries and assembles the response in the expected shape', async () => {
            const { svc, delegate, flag } = build();
            const stats = await svc.getStats();

            expect(delegate.count).toHaveBeenCalledTimes(1);
            expect(delegate.groupBy).toHaveBeenCalledTimes(3);
            expect(stats.runtime).toEqual(flag.getStatus());
            expect(stats.activeSignalCount.total).toBe(42);
            expect(stats.activeSignalCount.byVariant).toEqual({
                SE: 10,
                CRT: 25,
                BIAS: 7,
            });
            expect(stats.activeSignalCount.byAnchor).toEqual({
                WEEKLY: 5,
                DAILY: 30,
                FOURHOUR: 7,
            });
            // Phase 7.3 — sub-hour runtime must be surfaced alongside
            // the hourly runtime so the admin card can render both
            // health widgets without a second round trip.
            expect(stats.subHourRuntime).toEqual(flag.getSubHourStatus());
        });

        it('sorts byVariantAndAnchor deterministically (variant asc, then anchor asc)', async () => {
            const { svc } = build();
            const stats = await svc.getStats();
            const pairs = stats.activeSignalCount.byVariantAndAnchor.map(
                (r) => `${r.variant}/${r.anchor}`,
            );
            expect(pairs).toEqual([
                'BIAS/FOURHOUR',
                'BIAS/WEEKLY',
                'CRT/DAILY',
                'CRT/FOURHOUR',
                'SE/DAILY',
                'SE/WEEKLY',
            ]);
        });

        it('zero-fills variant/anchor counts when groupBy returns nothing', async () => {
            const { svc, delegate } = build();
            delegate.groupBy.mockImplementation(async () => []);
            delegate.count.mockResolvedValue(0);

            const stats = await svc.getStats();
            expect(stats.activeSignalCount.total).toBe(0);
            expect(stats.activeSignalCount.byVariant).toEqual({ SE: 0, CRT: 0, BIAS: 0 });
            expect(stats.activeSignalCount.byAnchor).toEqual({
                WEEKLY: 0,
                DAILY: 0,
                FOURHOUR: 0,
            });
            expect(stats.activeSignalCount.byVariantAndAnchor).toEqual([]);
        });
    });

    describe('setEnabled', () => {
        it('returns previousEnabled from the runtime flag and delegates the mutation', async () => {
            const { svc, flag } = build();
            const out = await svc.setEnabled(false, 'admin-id');

            expect(out.previousEnabled).toBe(true);
            expect(out.enabled).toBe(false);
            expect(flag.setEnabledMock).toHaveBeenCalledWith(false, 'admin-id');
        });

        it('handles idempotent flips (on→on still returns prev=on)', async () => {
            const { svc } = build();
            const out = await svc.setEnabled(true, 'admin');
            expect(out.previousEnabled).toBe(true);
            expect(out.enabled).toBe(true);
        });
    });

    describe('setSubHourEnabled (Phase 7.3)', () => {
        it('returns previousSubHourEnabled and delegates with the actor', async () => {
            const { svc, flag } = build();
            const out = await svc.setSubHourEnabled(false, 'admin-sub');

            expect(out.previousSubHourEnabled).toBe(true);
            expect(out.subHourEnabled).toBe(false);
            expect(flag.setSubHourEnabledMock).toHaveBeenCalledWith(
                false,
                'admin-sub',
            );
        });

        it('does not touch the master flag', async () => {
            const { svc, flag } = build();
            await svc.setSubHourEnabled(false, 'admin');
            expect(flag.setEnabledMock).not.toHaveBeenCalled();
            expect(flag.isEnabled()).toBe(true);
        });
    });

    describe('forceRescan', () => {
        it('wipes ACTIVE only (preserves CLOSED history) then runs detection synchronously', async () => {
            const { svc, delegate, detection } = build();
            const out = await svc.forceRescan();

            expect(delegate.deleteMany).toHaveBeenCalledWith({
                where: { status: 'ACTIVE' },
            });
            expect(detection.runDetection).toHaveBeenCalledTimes(1);
            expect(out.wiped).toBe(17);
            expect(out.detection).toEqual({
                created: 3,
                promoted: 0,
                demoted: 0,
                anchorChanged: 0,
                closed: 0,
                scannedVariants: 3,
            });
            expect(typeof out.elapsedMs).toBe('number');
            expect(out.elapsedMs).toBeGreaterThanOrEqual(0);
        });

        it('surfaces a detection failure to the caller instead of silently zeroing counters', async () => {
            const { svc, detection } = build();
            detection.runDetection.mockRejectedValueOnce(new Error('detection crashed'));
            await expect(svc.forceRescan()).rejects.toThrow('detection crashed');
        });
    });
});
