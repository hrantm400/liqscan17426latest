import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TickerModule } from '../ticker/ticker.module';
import { CoreLayerController } from './core-layer.controller';
import { CoreLayerDetectionService } from './core-layer.detection.service';
import { CoreLayerLifecycleService } from './core-layer.lifecycle.service';
import { CoreLayerQueryService } from './core-layer.query.service';
import { CoreLayerRuntimeFlagService } from './core-layer.runtime-flag.service';

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
    imports: [PrismaModule, TickerModule],
    controllers: [CoreLayerController],
    providers: [
        CoreLayerDetectionService,
        CoreLayerLifecycleService,
        CoreLayerQueryService,
        CoreLayerRuntimeFlagService,
    ],
    exports: [
        CoreLayerDetectionService,
        CoreLayerLifecycleService,
        CoreLayerQueryService,
        CoreLayerRuntimeFlagService,
    ],
})
export class CoreLayerModule {}
