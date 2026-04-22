import type { CoreLayerRuntimeStatus } from '../core-layer.runtime-flag.service';
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
