import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TickerModule } from '../ticker/ticker.module';
import { CoreLayerController } from './core-layer.controller';
import { CoreLayerDetectionService } from './core-layer.detection.service';
import { CoreLayerLifecycleService } from './core-layer.lifecycle.service';
import { CoreLayerQueryService } from './core-layer.query.service';

/**
 * Core-Layer backend module — Phase 4.
 *
 * Wires three services and one controller:
 *   - CoreLayerDetectionService  — hourly scan-side write path.
 *   - CoreLayerLifecycleService  — owns core_layer_signals writes.
 *   - CoreLayerQueryService      — REST read path, applies HTF override.
 *   - CoreLayerController        — GET /core-layer/{signals,signals/:id,stats}.
 *
 * All three services are exported so ScannerService (commit 4) and any
 * future admin tooling can depend on them without re-registering. The
 * runtime path is still gated by CORE_LAYER_ENABLED — with the flag off,
 * the controller returns `{ enabled: false }` and detection is never
 * invoked from the scanner.
 */
@Module({
    imports: [PrismaModule, TickerModule],
    controllers: [CoreLayerController],
    providers: [CoreLayerDetectionService, CoreLayerLifecycleService, CoreLayerQueryService],
    exports: [CoreLayerDetectionService, CoreLayerLifecycleService, CoreLayerQueryService],
})
export class CoreLayerModule {}
