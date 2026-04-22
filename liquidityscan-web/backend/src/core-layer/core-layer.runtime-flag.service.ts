import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../prisma/prisma.service';
import { readCoreLayerEnabledFromEnv } from './core-layer.feature-flag';

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

const APP_CONFIG_ID = 'singleton';
const RECENT_ERRORS_LIMIT = 10;

@Injectable()
export class CoreLayerRuntimeFlagService implements OnModuleInit {
    private readonly logger = new Logger(CoreLayerRuntimeFlagService.name);
    private readonly envSeed: boolean = readCoreLayerEnabledFromEnv();

    private enabled: boolean = this.envSeed;
    private initialized = false;

    private lastSuccessfulTickAt: number | null = null;
    private lastTickDurationMs: number | null = null;
    private tickCounter = 0;
    private consecutiveFailures = 0;
    private recentErrors: CoreLayerTickErrorRecord[] = [];

    constructor(private readonly prisma: PrismaService) {}

    async onModuleInit(): Promise<void> {
        try {
            const row = await this.prisma.appConfig.upsert({
                where: { id: APP_CONFIG_ID },
                create: {
                    id: APP_CONFIG_ID,
                    coreLayerEnabled: this.envSeed,
                },
                update: {},
                select: { coreLayerEnabled: true },
            });

            if (row.coreLayerEnabled == null) {
                await this.prisma.appConfig.update({
                    where: { id: APP_CONFIG_ID },
                    data: { coreLayerEnabled: this.envSeed },
                });
                this.enabled = this.envSeed;
                this.logger.log(
                    `Seeded AppConfig.coreLayerEnabled from CORE_LAYER_ENABLED env (=${this.envSeed})`,
                );
            } else {
                this.enabled = row.coreLayerEnabled;
                if (this.enabled !== this.envSeed) {
                    this.logger.log(
                        `Using admin-overridden AppConfig.coreLayerEnabled=${this.enabled} (env seed was ${this.envSeed})`,
                    );
                } else {
                    this.logger.log(`Core-Layer runtime flag = ${this.enabled}`);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(
                `Failed to initialize core-layer runtime flag from AppConfig: ${msg} — falling back to env seed (${this.envSeed})`,
            );
            Sentry.withScope((scope) => {
                scope.setTag('module', 'core-layer');
                scope.setTag('core_layer.stage', 'runtime-flag-init');
                Sentry.captureException(err);
            });
            this.enabled = this.envSeed;
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

    /** Test helper — resets all telemetry state to its initial zero-values. */
    resetTelemetryForTesting(): void {
        this.lastSuccessfulTickAt = null;
        this.lastTickDurationMs = null;
        this.tickCounter = 0;
        this.consecutiveFailures = 0;
        this.recentErrors = [];
    }

    /** Test helper — true once onModuleInit has run. */
    isInitializedForTesting(): boolean {
        return this.initialized;
    }
}
