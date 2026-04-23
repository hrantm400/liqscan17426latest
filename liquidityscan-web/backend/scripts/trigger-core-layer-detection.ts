/**
 * One-shot trigger for CoreLayerDetectionService.runDetection — boots a minimal
 * Nest application context, runs a full-universe detection pass, prints the
 * counters, and exits. Used for manual verification after backend deploys that
 * change detection logic (e.g. the §4 temporal-coherence gate).
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/trigger-core-layer-detection.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CoreLayerDetectionService } from '../src/core-layer/core-layer.detection.service';

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'warn', 'error'],
    });
    const detection = app.get(CoreLayerDetectionService);
    const now = Date.now();
    console.log(`[trigger] calling runDetection(${now}) …`);
    const result = await detection.runDetection(now);
    console.log(`[trigger] result:`, result);
    await app.close();
    process.exit(0);
}

main().catch((err) => {
    console.error('[trigger] failed:', err);
    process.exit(1);
});
