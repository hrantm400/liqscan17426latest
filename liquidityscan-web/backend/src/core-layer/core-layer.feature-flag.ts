/**
 * CORE_LAYER_ENABLED env-flag reader.
 *
 * Mirrors the MARKET_SCANNER_ENABLED pattern in ScannerService but defaults
 * to OFF (different polarity) per ADR D11. Detection + API are no-ops when
 * the flag is unset or falsy. Flipping the flag requires a backend restart
 * — we deliberately do not hot-reload so Sentry traces, log tags, and scan
 * counters are all consistent for the lifetime of a process.
 *
 * The flag is read once at module import time so every reference to
 * `isCoreLayerEnabled` inside the request cycle is constant-cost.
 */
function readCoreLayerEnabledFromEnv(): boolean {
    const v = process.env.CORE_LAYER_ENABLED;
    if (v === undefined || v === '') return false;
    const s = String(v).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(s);
}

export const isCoreLayerEnabled: boolean = readCoreLayerEnabledFromEnv();
