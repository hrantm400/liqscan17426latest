/**
 * CoreLayerRuntimeFlagService — unit tests.
 *
 * The service is intentionally small so we exercise it via a hand-rolled
 * fake Prisma client rather than reaching for a full-blown mock framework.
 * Each test re-instantiates the service and the fake so env + DB state
 * stay isolated.
 */

import { CoreLayerRuntimeFlagService } from '../core-layer.runtime-flag.service';

class FakeAppConfigStore {
    row: {
        id: string;
        coreLayerEnabled: boolean | null;
        coreLayerSubHourEnabled: boolean | null;
    } | null = null;
    upsertCalls = 0;
    updateCalls = 0;

    upsert = jest.fn(async ({ where, create, update, select }: any) => {
        this.upsertCalls += 1;
        if (this.row && this.row.id === where.id) {
            Object.assign(this.row, update ?? {});
        } else {
            this.row = {
                id: create.id,
                coreLayerEnabled: create.coreLayerEnabled ?? null,
                coreLayerSubHourEnabled: create.coreLayerSubHourEnabled ?? null,
            };
        }
        if (select) {
            const picked: Record<string, any> = {};
            for (const key of Object.keys(select)) {
                if (select[key]) picked[key] = (this.row as any)[key];
            }
            return picked;
        }
        return this.row;
    });

    update = jest.fn(async ({ where, data }: any) => {
        this.updateCalls += 1;
        if (!this.row || this.row.id !== where.id) {
            throw new Error('row not found');
        }
        Object.assign(this.row, data);
        return this.row;
    });
}

function makeService(
    envValue?: string | undefined,
    subHourEnvValue?: string | undefined,
): {
    svc: CoreLayerRuntimeFlagService;
    store: FakeAppConfigStore;
} {
    if (envValue === undefined) delete process.env.CORE_LAYER_ENABLED;
    else process.env.CORE_LAYER_ENABLED = envValue;
    if (subHourEnvValue === undefined) delete process.env.CORE_LAYER_SUBHOUR_ENABLED;
    else process.env.CORE_LAYER_SUBHOUR_ENABLED = subHourEnvValue;
    const store = new FakeAppConfigStore();
    const prisma = { appConfig: store } as any;
    const svc = new CoreLayerRuntimeFlagService(prisma);
    return { svc, store };
}

describe('CoreLayerRuntimeFlagService', () => {
    const originalEnv = process.env.CORE_LAYER_ENABLED;
    const originalSubHourEnv = process.env.CORE_LAYER_SUBHOUR_ENABLED;

    afterAll(() => {
        if (originalEnv === undefined) delete process.env.CORE_LAYER_ENABLED;
        else process.env.CORE_LAYER_ENABLED = originalEnv;
        if (originalSubHourEnv === undefined) {
            delete process.env.CORE_LAYER_SUBHOUR_ENABLED;
        } else {
            process.env.CORE_LAYER_SUBHOUR_ENABLED = originalSubHourEnv;
        }
    });

    describe('boot seed', () => {
        it('seeds AppConfig from env when row does not exist', async () => {
            const { svc, store } = makeService('true');
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(true);
            expect(store.row?.coreLayerEnabled).toBe(true);
            // First boot after migration: the upsert(create) path already
            // writes the seed value; no follow-up update is needed.
            expect(store.updateCalls).toBe(0);
            expect(store.upsertCalls).toBe(1);
        });

        it('seeds AppConfig from env when row exists with null column (post-migration first boot)', async () => {
            const { svc, store } = makeService('true');
            store.row = {
                id: 'singleton',
                coreLayerEnabled: null,
                coreLayerSubHourEnabled: null,
            };
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(true);
            expect(store.row.coreLayerEnabled).toBe(true);
            // Row exists but column is null → upsert(update:{}) is a no-op,
            // then a follow-up update patches coreLayerEnabled to the seed.
            expect(store.updateCalls).toBe(1);
        });

        it('respects AppConfig when the column is already set (admin override wins over env)', async () => {
            const { svc, store } = makeService('true');
            store.row = {
                id: 'singleton',
                coreLayerEnabled: false,
                // Pre-seed the sub-hour column too so this test isolates
                // the master-flag precedence rule — otherwise the
                // Phase 7.3 sub-hour NULL check in onModuleInit would
                // trigger a spurious follow-up update and throw off
                // the updateCalls assertion below.
                coreLayerSubHourEnabled: false,
            };
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(false);
            expect(store.updateCalls).toBe(0);
        });

        it('defaults to false when env is unset and no AppConfig row exists yet', async () => {
            const { svc, store } = makeService(undefined);
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(false);
            expect(store.row?.coreLayerEnabled).toBe(false);
        });

        it('falls back to env value if Prisma throws during init', async () => {
            const { svc } = makeService('on');
            (svc as any).prisma.appConfig.upsert.mockImplementationOnce(() => {
                throw new Error('db down at boot');
            });
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(true);
            expect(svc.isInitializedForTesting()).toBe(true);
        });
    });

    describe('setEnabled', () => {
        it('persists the new value and updates the in-memory cache', async () => {
            const { svc, store } = makeService('false');
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(false);

            await svc.setEnabled(true, 'admin-1');

            expect(svc.isEnabled()).toBe(true);
            expect(store.row?.coreLayerEnabled).toBe(true);
        });

        it('resets consecutiveFailures on flip false→true (ADR D15)', async () => {
            const { svc } = makeService('true');
            await svc.onModuleInit();
            svc.recordTickStart();
            svc.recordTickFailure(new Error('tick broke'));
            svc.recordTickStart();
            svc.recordTickFailure(new Error('tick broke again'));
            expect(svc.getStatus().consecutiveFailures).toBe(2);

            await svc.setEnabled(false, 'admin');
            expect(svc.getStatus().consecutiveFailures).toBe(2); // off→off/off→on only resets; false→false no-op

            await svc.setEnabled(true, 'admin');
            expect(svc.getStatus().consecutiveFailures).toBe(0);
        });

        it('does not reset counter on flip on→on (idempotent set)', async () => {
            const { svc } = makeService('true');
            await svc.onModuleInit();
            svc.recordTickStart();
            svc.recordTickFailure(new Error('x'));
            expect(svc.getStatus().consecutiveFailures).toBe(1);

            await svc.setEnabled(true, 'admin'); // already true
            expect(svc.getStatus().consecutiveFailures).toBe(1);
        });
    });

    describe('telemetry', () => {
        it('tracks tick number, last success timestamp, and last duration', async () => {
            const { svc } = makeService('true');
            await svc.onModuleInit();

            expect(svc.recordTickStart()).toBe(1);
            svc.recordTickSuccess(42);
            expect(svc.recordTickStart()).toBe(2);
            svc.recordTickSuccess(99);

            const status = svc.getStatus();
            expect(status.lastTickNumber).toBe(2);
            expect(status.lastTickDurationMs).toBe(99);
            expect(status.lastSuccessfulTickAt).not.toBeNull();
            expect(status.consecutiveFailures).toBe(0);
        });

        it('keeps only the 10 most recent errors in FIFO order (newest first)', async () => {
            const { svc } = makeService('true');
            await svc.onModuleInit();

            for (let i = 1; i <= 15; i++) {
                svc.recordTickStart();
                svc.recordTickFailure(new Error(`error-${i}`));
            }

            const status = svc.getStatus();
            expect(status.recentErrors).toHaveLength(10);
            expect(status.recentErrors[0].message).toBe('error-15');
            expect(status.recentErrors[9].message).toBe('error-6');
            expect(status.consecutiveFailures).toBe(15);
        });

        it('truncates very long error messages to 500 chars', async () => {
            const { svc } = makeService('true');
            await svc.onModuleInit();
            const huge = 'X'.repeat(2000);
            svc.recordTickStart();
            svc.recordTickFailure(new Error(huge));

            const status = svc.getStatus();
            expect(status.recentErrors[0].message.length).toBe(500);
        });

        it('resets consecutiveFailures to 0 on a successful tick', async () => {
            const { svc } = makeService('true');
            await svc.onModuleInit();
            svc.recordTickStart();
            svc.recordTickFailure(new Error('boom'));
            svc.recordTickStart();
            svc.recordTickFailure(new Error('boom again'));
            expect(svc.getStatus().consecutiveFailures).toBe(2);

            svc.recordTickStart();
            svc.recordTickSuccess(100);
            expect(svc.getStatus().consecutiveFailures).toBe(0);
        });
    });

    describe('circuit breaker (§11)', () => {
        /**
         * Wait for the fire-and-forget setEnabled call inside
         * maybeTripHourlyBreaker to settle. Yielding twice to the microtask
         * queue is enough because the fake Prisma store resolves synchronously
         * inside its async fn.
         */
        const flushMicrotasks = async () => {
            await Promise.resolve();
            await Promise.resolve();
        };

        it('auto-disables hourly flag after 3 consecutive failures', async () => {
            const { svc, store } = makeService('true');
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(true);

            svc.recordTickStart();
            svc.recordTickFailure(new Error('1'));
            svc.recordTickStart();
            svc.recordTickFailure(new Error('2'));
            expect(svc.isEnabled()).toBe(true);

            svc.recordTickStart();
            svc.recordTickFailure(new Error('3'));
            await flushMicrotasks();

            expect(svc.isEnabled()).toBe(false);
            expect(store.row?.coreLayerEnabled).toBe(false);
        });

        it('does not re-trip when already disabled (no redundant writes)', async () => {
            const { svc, store } = makeService('true');
            await svc.onModuleInit();

            for (let i = 0; i < 3; i++) {
                svc.recordTickStart();
                svc.recordTickFailure(new Error(`f${i}`));
            }
            await flushMicrotasks();
            const writesAfterTrip = store.upsertCalls;

            // More failures after trip — breaker should not do extra writes.
            for (let i = 0; i < 3; i++) {
                svc.recordTickStart();
                svc.recordTickFailure(new Error(`extra${i}`));
            }
            await flushMicrotasks();

            expect(store.upsertCalls).toBe(writesAfterTrip);
            expect(svc.isEnabled()).toBe(false);
        });

        it('admin setEnabled(true) clears counter and re-arms the breaker', async () => {
            const { svc } = makeService('true');
            await svc.onModuleInit();

            for (let i = 0; i < 3; i++) {
                svc.recordTickStart();
                svc.recordTickFailure(new Error(`x${i}`));
            }
            await flushMicrotasks();
            expect(svc.isEnabled()).toBe(false);

            await svc.setEnabled(true, 'admin');
            expect(svc.isEnabled()).toBe(true);
            expect(svc.getStatus().consecutiveFailures).toBe(0);

            // Two new failures after re-arm — still enabled
            svc.recordTickStart();
            svc.recordTickFailure(new Error('new-1'));
            svc.recordTickStart();
            svc.recordTickFailure(new Error('new-2'));
            expect(svc.isEnabled()).toBe(true);
        });

        it('sub-hour breaker trips independently of hourly', async () => {
            const { svc } = makeService('true', 'true');
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(true);
            expect(svc.isSubHourEnabled()).toBe(true);

            for (let i = 0; i < 3; i++) {
                svc.recordSubHourTickStart(0);
                svc.recordSubHourTickFailure(new Error(`sh${i}`));
            }
            await flushMicrotasks();

            expect(svc.isSubHourEnabled()).toBe(false);
            // Hourly must remain on — the two breakers are disjoint.
            expect(svc.isEnabled()).toBe(true);
        });
    });

    describe('getStatus', () => {
        it('returns a defensive copy of recentErrors (callers cannot mutate internal state)', async () => {
            const { svc } = makeService('true');
            await svc.onModuleInit();
            svc.recordTickStart();
            svc.recordTickFailure(new Error('x'));

            const first = svc.getStatus().recentErrors;
            first.push({ at: 0, message: 'injected', tickNumber: 999 });

            const second = svc.getStatus().recentErrors;
            expect(second).toHaveLength(1);
            expect(second[0].message).toBe('x');
        });

        it('exposes the env seed separately from the effective value', async () => {
            const { svc, store } = makeService('true');
            store.row = {
                id: 'singleton',
                coreLayerEnabled: false,
                coreLayerSubHourEnabled: null,
            };
            await svc.onModuleInit();

            const status = svc.getStatus();
            expect(status.enabled).toBe(false);
            expect(status.envSeed).toBe(true);
        });
    });

    describe('sub-hour flag (Phase 7.3)', () => {
        it('seeds coreLayerSubHourEnabled from env on first boot (no row)', async () => {
            const { svc, store } = makeService('true', 'true');
            await svc.onModuleInit();
            expect(svc.isSubHourEnabled()).toBe(true);
            expect(store.row?.coreLayerSubHourEnabled).toBe(true);
        });

        it('patches the column to env seed when row exists but column is null', async () => {
            const { svc, store } = makeService('true', 'true');
            store.row = {
                id: 'singleton',
                coreLayerEnabled: true,
                coreLayerSubHourEnabled: null,
            };
            await svc.onModuleInit();
            expect(svc.isSubHourEnabled()).toBe(true);
            expect(store.row.coreLayerSubHourEnabled).toBe(true);
            expect(store.updateCalls).toBeGreaterThanOrEqual(1);
        });

        it('admin-set sub-hour value wins over env seed', async () => {
            const { svc, store } = makeService('true', 'true');
            store.row = {
                id: 'singleton',
                coreLayerEnabled: true,
                coreLayerSubHourEnabled: false,
            };
            await svc.onModuleInit();
            expect(svc.isSubHourEnabled()).toBe(false);
        });

        it('independently mutable via setSubHourEnabled without touching master flag', async () => {
            const { svc } = makeService('true', 'false');
            await svc.onModuleInit();
            expect(svc.isEnabled()).toBe(true);
            expect(svc.isSubHourEnabled()).toBe(false);

            await svc.setSubHourEnabled(true, 'admin');

            expect(svc.isEnabled()).toBe(true);
            expect(svc.isSubHourEnabled()).toBe(true);
        });

        it('tracks sub-hour tick telemetry disjoint from hourly telemetry', async () => {
            const { svc } = makeService('true', 'true');
            await svc.onModuleInit();

            svc.recordTickStart();
            svc.recordTickSuccess(10);
            expect(svc.getStatus().lastTickNumber).toBe(1);

            expect(svc.recordSubHourTickStart(3)).toBe(1);
            svc.recordSubHourTickSuccess(20);
            const sub = svc.getSubHourStatus();
            expect(sub.lastTickNumber).toBe(1);
            expect(sub.lastDirtyPairCount).toBe(3);
            expect(sub.lastTickDurationMs).toBe(20);

            // Hourly counter unaffected.
            expect(svc.getStatus().lastTickNumber).toBe(1);
        });
    });
});
