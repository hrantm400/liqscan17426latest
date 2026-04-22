import type {
    CoreLayerRuntimeStatus,
    CoreLayerSubHourRuntimeStatus,
} from '../core-layer.runtime-flag.service';
import type { AnchorType, CoreLayerVariantKey } from '../core-layer.constants';

/**
 * Response DTOs for the Phase 5b admin endpoints.
 *
 * These live next to the public core-layer-signal DTOs but are kept
 * separate to make it obvious which shape belongs to which endpoint —
 * admin callers only ever need aggregate + control-plane data, never
 * individual signal rows.
 */

export interface CoreLayerAdminStatsDto {
    runtime: CoreLayerRuntimeStatus;
    // Phase 7.3 — sibling sub-hour status lives at the top level so the
    // admin card can render two independent health widgets (hourly /
    // sub-hour) without reaching into nested telemetry struct shapes.
    subHourRuntime: CoreLayerSubHourRuntimeStatus;
    activeSignalCount: {
        total: number;
        byVariant: Record<CoreLayerVariantKey, number>;
        byAnchor: Record<AnchorType, number>;
        byVariantAndAnchor: Array<{
            variant: CoreLayerVariantKey;
            anchor: AnchorType;
            count: number;
        }>;
    };
}

export interface CoreLayerAdminForceRescanDto {
    wiped: number;
    detection: {
        created: number;
        promoted: number;
        demoted: number;
        anchorChanged: number;
        closed: number;
        scannedVariants: number;
    };
    elapsedMs: number;
}

export interface CoreLayerAdminSetEnabledDto {
    enabled: boolean;
    previousEnabled: boolean;
}

/**
 * Phase 7.3 — sub-hour toggle response. Distinct DTO from the master
 * toggle so the admin UI can't accidentally confuse which flag it
 * just flipped when serializing for a toast notification.
 */
export interface CoreLayerAdminSetSubHourEnabledDto {
    subHourEnabled: boolean;
    previousSubHourEnabled: boolean;
}
