/**
 * CORE_LAYER_ENABLED env-flag reader.
 *
 * As of Phase 5b this file exports only the env-parse helper. The
 * previous compile-time `isCoreLayerEnabled` const has been replaced
 * by CoreLayerRuntimeFlagService, which calls
 * `readCoreLayerEnabledFromEnv()` once at boot as the seed value for
 * the AppConfig-backed runtime flag. Every in-process read of "is
 * Core-Layer on right now?" goes through the service instead of this
 * module, so admin-panel toggles take effect without a restart.
 *
 * Accepted truthy env values (case-insensitive, trimmed):
 *   '1', 'true', 'yes', 'on', 'enabled'.
 * Everything else — including unset / empty — is treated as `false`.
 */
export function readCoreLayerEnabledFromEnv(): boolean {
    const v = process.env.CORE_LAYER_ENABLED;
    if (v === undefined || v === '') return false;
    const s = String(v).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(s);
}

/**
 * Phase 7.3 — sub-hour scanning env-flag reader.
 *
 * Mirrors the semantics of readCoreLayerEnabledFromEnv() but reads
 * CORE_LAYER_SUBHOUR_ENABLED. Used as the one-shot AppConfig seed on
 * first boot after the Phase 7.3 migration. Keeping the two flags
 * independent lets ops deploy the WS extension + dispatcher code
 * first (master flag on, sub-hour flag off) and flip sub-hour scanning
 * only after observing WS connection-pool stability — per ADR D18.
 */
export function readCoreLayerSubHourEnabledFromEnv(): boolean {
    const v = process.env.CORE_LAYER_SUBHOUR_ENABLED;
    if (v === undefined || v === '') return false;
    const s = String(v).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(s);
}
