import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TickerModule } from '../ticker/ticker.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { AuthModule } from '../auth/auth.module';
import { CoreLayerAdminService } from './core-layer.admin.service';
import { CoreLayerController } from './core-layer.controller';
import { CoreLayerDetectionService } from './core-layer.detection.service';
import { CoreLayerLifecycleService } from './core-layer.lifecycle.service';
import { CoreLayerQueryService } from './core-layer.query.service';
import { CoreLayerRuntimeFlagService } from './core-layer.runtime-flag.service';
import { CoreLayerTierResolverService } from './core-layer.tier-resolver.service';

/**
 * Core-Layer backend module.
 *
 * Wires four services and one controller:
 *   - CoreLayerDetectionService    — hourly scan-side write path.
 *   - CoreLayerLifecycleService    — owns core_layer_signals writes.
 *   - CoreLayerQueryService        — REST read path, applies HTF override.
 *   - CoreLayerRuntimeFlagService  — Phase 5b runtime flag + tick telemetry.
 *   - CoreLayerController          — GET /core-layer/{signals,signals/:id,stats}.
 *
 * All services are exported so ScannerService (detection + runtime flag) and
 * the admin controller (runtime flag + detection for force-rescan) can depend
 * on them without re-registering. The runtime path is gated by
 * CoreLayerRuntimeFlagService — a boot-time env seed feeds AppConfig, and
 * after first boot AppConfig is the source of truth. With the flag off,
 * the controller returns `{ enabled: false }` and detection is never
 * invoked from the scanner.
 */
@Module({
    // AuthModule re-exports JwtModule; CoreLayerTierResolverService needs
    // JwtService to decode the optional `Authorization` header on public
    // Core-Layer endpoints (Phase 7.3). AppConfigModule provides the
    // launch-promo flag that feeds the FREE → FULL_ACCESS promotion.
    imports: [PrismaModule, TickerModule, AppConfigModule, AuthModule],
    controllers: [CoreLayerController],
    providers: [
        CoreLayerDetectionService,
        CoreLayerLifecycleService,
        CoreLayerQueryService,
        CoreLayerRuntimeFlagService,
        CoreLayerAdminService,
        CoreLayerTierResolverService,
    ],
    exports: [
        CoreLayerDetectionService,
        CoreLayerLifecycleService,
        CoreLayerQueryService,
        CoreLayerRuntimeFlagService,
        CoreLayerAdminService,
        CoreLayerTierResolverService,
    ],
})
export class CoreLayerModule {}
