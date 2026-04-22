import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../prisma/prisma.service';
import {
    readCoreLayerEnabledFromEnv,
    readCoreLayerSubHourEnabledFromEnv,
} from './core-layer.feature-flag';

/**
 * Phase 5b — Core-Layer runtime flag + telemetry.
 *
 * Replaces the compile-time `isCoreLayerEnabled` const with a runtime-
 * toggleable flag persisted on the `AppConfig` singleton. Also owns the
 * per-tick telemetry consumed by the admin stats endpoint.
 *
 * Boot sequence (onModuleInit):
 *   1. Read `CORE_LAYER_ENABLED` env var.
 *   2. Read AppConfig.coreLayerEnabled.
 *      - If non-null → that value wins. Admin has taken control of
 *        this setting and the env var is ignored from here on.
 *      - If null (first boot after the Phase 5b migration) → seed
 *        AppConfig with the env value so subsequent admin reads have
 *        a truthful starting point, and use the env value for this
 *        process.
 *   3. Cache the effective value in memory. All read calls are O(1);
 *      `setEnabled` writes to AppConfig + updates the cache.
 *
 * The env var thus becomes a one-shot seed. After first boot, AppConfig
 * is the only source of truth. Restarting the process without changing
 * AppConfig is a no-op for the flag state.
 *
 * Telemetry:
 *   - `recordTickStart / Success / Failure` are called by the thin
 *     wrapper around `runDetection` inside ScannerService.
 *   - `consecutiveFailures` increments on each failure and resets on
 *     next success. It is ALSO reset by `setEnabled(true)` — per ADR
 *     D15 the admin flipping the flag back on is an explicit "try
 *     again" and must clear any tripped circuit breaker state.
 *   - `recentErrors` is a 10-deep ring buffer. Entries are dropped
 *     FIFO; we do not persist them anywhere — they are a convenience
 *     for admin introspection, not an audit log. Sentry remains the
 *     audit log via existing capture calls.
 */

export interface CoreLayerTickErrorRecord {
    at: number;
    message: string;
    tickNumber: number;
}

export interface CoreLayerRuntimeStatus {
    enabled: boolean;
    envSeed: boolean;
    lastSuccessfulTickAt: number | null;
    lastTickDurationMs: number | null;
    lastTickNumber: number;
    consecutiveFailures: number;
    recentErrors: CoreLayerTickErrorRecord[];
}

/**
 * Phase 7.3 — sub-hour telemetry is tracked in a sibling struct so the
 * admin panel can display hourly and sub-hour tick health side-by-side
 * without the two streams clobbering each other's counters.
 */
export interface CoreLayerSubHourRuntimeStatus {
    enabled: boolean;
    envSeed: boolean;
    lastSuccessfulTickAt: number | null;
    lastTickDurationMs: number | null;
    lastTickNumber: number;
    consecutiveFailures: number;
    recentErrors: CoreLayerTickErrorRecord[];
    lastDirtyPairCount: number | null;
}

const APP_CONFIG_ID = 'singleton';
const RECENT_ERRORS_LIMIT = 10;

@Injectable()
export class CoreLayerRuntimeFlagService implements OnModuleInit {
    private readonly logger = new Logger(CoreLayerRuntimeFlagService.name);
    private readonly envSeed: boolean = readCoreLayerEnabledFromEnv();
    private readonly subHourEnvSeed: boolean = readCoreLayerSubHourEnabledFromEnv();

    private enabled: boolean = this.envSeed;
    private subHourEnabled: boolean = this.subHourEnvSeed;
    private initialized = false;

    private lastSuccessfulTickAt: number | null = null;
    private lastTickDurationMs: number | null = null;
    private tickCounter = 0;
    private consecutiveFailures = 0;
    private recentErrors: CoreLayerTickErrorRecord[] = [];

    // Phase 7.3 — sub-hour sibling telemetry. Kept disjoint from the
    // hourly counters above so a broken sub-hour dispatcher does not
    // muddy the hourly scanner's health signal (and vice versa).
    private subHourLastSuccessfulTickAt: number | null = null;
    private subHourLastTickDurationMs: number | null = null;
    private subHourTickCounter = 0;
    private subHourConsecutiveFailures = 0;
    private subHourRecentErrors: CoreLayerTickErrorRecord[] = [];
    private subHourLastDirtyPairCount: number | null = null;

    constructor(private readonly prisma: PrismaService) {}

    async onModuleInit(): Promise<void> {
        try {
            const row = await this.prisma.appConfig.upsert({
                where: { id: APP_CONFIG_ID },
                create: {
                    id: APP_CONFIG_ID,
                    coreLayerEnabled: this.envSeed,
                    coreLayerSubHourEnabled: this.subHourEnvSeed,
                },
                update: {},
                select: {
                    coreLayerEnabled: true,
                    coreLayerSubHourEnabled: true,
                },
            });

            // Two seeds, two independent NULL-checks — either column can be
            // first-boot-null while the other is already admin-set (e.g. a
            // long-running deploy enabled the master flag weeks before the
            // Phase 7.3 migration shipped).
            const needsCoreSeed = row.coreLayerEnabled == null;
            const needsSubHourSeed = row.coreLayerSubHourEnabled == null;
            if (needsCoreSeed || needsSubHourSeed) {
                await this.prisma.appConfig.update({
                    where: { id: APP_CONFIG_ID },
                    data: {
                        ...(needsCoreSeed ? { coreLayerEnabled: this.envSeed } : {}),
                        ...(needsSubHourSeed
                            ? { coreLayerSubHourEnabled: this.subHourEnvSeed }
                            : {}),
                    },
                });
                if (needsCoreSeed) {
                    this.enabled = this.envSeed;
                    this.logger.log(
                        `Seeded AppConfig.coreLayerEnabled from CORE_LAYER_ENABLED env (=${this.envSeed})`,
                    );
                } else {
                    this.enabled = row.coreLayerEnabled as boolean;
                }
                if (needsSubHourSeed) {
                    this.subHourEnabled = this.subHourEnvSeed;
                    this.logger.log(
                        `Seeded AppConfig.coreLayerSubHourEnabled from CORE_LAYER_SUBHOUR_ENABLED env (=${this.subHourEnvSeed})`,
                    );
                } else {
                    this.subHourEnabled = row.coreLayerSubHourEnabled as boolean;
                }
            } else {
                this.enabled = row.coreLayerEnabled;
                this.subHourEnabled = row.coreLayerSubHourEnabled;
                if (this.enabled !== this.envSeed) {
                    this.logger.log(
                        `Using admin-overridden AppConfig.coreLayerEnabled=${this.enabled} (env seed was ${this.envSeed})`,
                    );
                } else {
                    this.logger.log(`Core-Layer runtime flag = ${this.enabled}`);
                }
                if (this.subHourEnabled !== this.subHourEnvSeed) {
                    this.logger.log(
                        `Using admin-overridden AppConfig.coreLayerSubHourEnabled=${this.subHourEnabled} (env seed was ${this.subHourEnvSeed})`,
                    );
                } else {
                    this.logger.log(`Core-Layer sub-hour runtime flag = ${this.subHourEnabled}`);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(
                `Failed to initialize core-layer runtime flag from AppConfig: ${msg} — falling back to env seeds (enabled=${this.envSeed}, subHour=${this.subHourEnvSeed})`,
            );
            Sentry.withScope((scope) => {
                scope.setTag('module', 'core-layer');
                scope.setTag('core_layer.stage', 'runtime-flag-init');
                Sentry.captureException(err);
            });
            this.enabled = this.envSeed;
            this.subHourEnabled = this.subHourEnvSeed;
        } finally {
            this.initialized = true;
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Persist a new flag value. Resets the circuit-breaker counter on
     * flip-on per ADR D15 ("admin is explicitly saying: try again").
     */
    async setEnabled(value: boolean, actor?: string): Promise<void> {
        const prev = this.enabled;
        await this.prisma.appConfig.upsert({
            where: { id: APP_CONFIG_ID },
            create: {
                id: APP_CONFIG_ID,
                coreLayerEnabled: value,
            },
            update: { coreLayerEnabled: value },
        });
        this.enabled = value;
        if (prev === false && value === true) {
            this.consecutiveFailures = 0;
        }
        this.logger.log(
            `Core-Layer runtime flag ${prev} → ${value} (actor=${actor ?? 'unknown'})`,
        );
    }

    /** Increments the tick counter and returns the new tick number. */
    recordTickStart(): number {
        this.tickCounter += 1;
        return this.tickCounter;
    }

    recordTickSuccess(durationMs: number): void {
        this.lastSuccessfulTickAt = Date.now();
        this.lastTickDurationMs = durationMs;
        this.consecutiveFailures = 0;
    }

    recordTickFailure(err: unknown): void {
        this.consecutiveFailures += 1;
        const message = err instanceof Error ? err.message : String(err);
        const entry: CoreLayerTickErrorRecord = {
            at: Date.now(),
            message: message.slice(0, 500),
            tickNumber: this.tickCounter,
        };
        this.recentErrors.unshift(entry);
        if (this.recentErrors.length > RECENT_ERRORS_LIMIT) {
            this.recentErrors.length = RECENT_ERRORS_LIMIT;
        }
    }

    getStatus(): CoreLayerRuntimeStatus {
        return {
            enabled: this.enabled,
            envSeed: this.envSeed,
            lastSuccessfulTickAt: this.lastSuccessfulTickAt,
            lastTickDurationMs: this.lastTickDurationMs,
            lastTickNumber: this.tickCounter,
            consecutiveFailures: this.consecutiveFailures,
            recentErrors: [...this.recentErrors],
        };
    }

    // ── Phase 7.3 — sub-hour flag + telemetry ─────────────────────────

    isSubHourEnabled(): boolean {
        return this.subHourEnabled;
    }

    /**
     * Persist a new sub-hour flag value. Same reset-on-flip-on semantics
     * as `setEnabled` (ADR D15): turning sub-hour back on is an explicit
     * "try again" that clears the tripped circuit-breaker counter.
     */
    async setSubHourEnabled(value: boolean, actor?: string): Promise<void> {
        const prev = this.subHourEnabled;
        await this.prisma.appConfig.upsert({
            where: { id: APP_CONFIG_ID },
            create: {
                id: APP_CONFIG_ID,
                coreLayerSubHourEnabled: value,
            },
            update: { coreLayerSubHourEnabled: value },
        });
        this.subHourEnabled = value;
        if (prev === false && value === true) {
            this.subHourConsecutiveFailures = 0;
        }
        this.logger.log(
            `Core-Layer sub-hour runtime flag ${prev} → ${value} (actor=${actor ?? 'unknown'})`,
        );
    }

    /** Increments the sub-hour tick counter and returns the new tick number. */
    recordSubHourTickStart(dirtyPairCount: number): number {
        this.subHourTickCounter += 1;
        this.subHourLastDirtyPairCount = dirtyPairCount;
        return this.subHourTickCounter;
    }

    recordSubHourTickSuccess(durationMs: number): void {
        this.subHourLastSuccessfulTickAt = Date.now();
        this.subHourLastTickDurationMs = durationMs;
        this.subHourConsecutiveFailures = 0;
    }

    recordSubHourTickFailure(err: unknown): void {
        this.subHourConsecutiveFailures += 1;
        const message = err instanceof Error ? err.message : String(err);
        const entry: CoreLayerTickErrorRecord = {
            at: Date.now(),
            message: message.slice(0, 500),
            tickNumber: this.subHourTickCounter,
        };
        this.subHourRecentErrors.unshift(entry);
        if (this.subHourRecentErrors.length > RECENT_ERRORS_LIMIT) {
            this.subHourRecentErrors.length = RECENT_ERRORS_LIMIT;
        }
    }

    getSubHourStatus(): CoreLayerSubHourRuntimeStatus {
        return {
            enabled: this.subHourEnabled,
            envSeed: this.subHourEnvSeed,
            lastSuccessfulTickAt: this.subHourLastSuccessfulTickAt,
            lastTickDurationMs: this.subHourLastTickDurationMs,
            lastTickNumber: this.subHourTickCounter,
            consecutiveFailures: this.subHourConsecutiveFailures,
            recentErrors: [...this.subHourRecentErrors],
            lastDirtyPairCount: this.subHourLastDirtyPairCount,
        };
    }

    /** Test helper — resets all telemetry state to its initial zero-values. */
    resetTelemetryForTesting(): void {
        this.lastSuccessfulTickAt = null;
        this.lastTickDurationMs = null;
        this.tickCounter = 0;
        this.consecutiveFailures = 0;
        this.recentErrors = [];
        this.subHourLastSuccessfulTickAt = null;
        this.subHourLastTickDurationMs = null;
        this.subHourTickCounter = 0;
        this.subHourConsecutiveFailures = 0;
        this.subHourRecentErrors = [];
        this.subHourLastDirtyPairCount = null;
    }

    /** Test helper — true once onModuleInit has run. */
    isInitializedForTesting(): boolean {
        return this.initialized;
    }
}
