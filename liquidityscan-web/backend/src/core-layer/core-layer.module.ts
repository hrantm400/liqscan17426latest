import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CoreLayerDetectionService } from './core-layer.detection.service';
import { CoreLayerLifecycleService } from './core-layer.lifecycle.service';

/**
 * Core-Layer backend module — Phase 4.
 *
 * Detection + lifecycle services are registered here so they are available
 * via Nest DI to any other module that wants to call them (commit 4 wires
 * ScannerService from the signals module to invoke runDetection() after each
 * hourly scan pass). The query service + REST controller are added in
 * commit 3.
 *
 * The module ships registered unconditionally, but runtime behaviour is
 * gated by the CORE_LAYER_ENABLED env var (wired in commit 4). With the flag
 * off, the services exist but are never called.
 */
@Module({
    imports: [PrismaModule],
    providers: [CoreLayerDetectionService, CoreLayerLifecycleService],
    exports: [CoreLayerDetectionService, CoreLayerLifecycleService],
})
export class CoreLayerModule {}
