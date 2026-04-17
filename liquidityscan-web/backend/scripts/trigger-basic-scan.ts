/**
 * One-shot market scan (same as POST /api/signals/scan) without HTTP/JWT.
 * Requires MARKET_SCANNER_ENABLED=true in .env (or unset = enabled).
 *
 * Usage (from backend dir): npx ts-node scripts/trigger-basic-scan.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ScannerService } from '../src/signals/scanner.service';

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    });
    try {
        const scanner = app.get(ScannerService);
        if (!scanner.isMarketScannerEnabled()) {
            console.error('Market scanner is disabled (MARKET_SCANNER_ENABLED=false). Enable it and retry.');
            process.exit(1);
        }
        console.log('Running scanBasicStrategies()…');
        await scanner.scanBasicStrategies();
        console.log('Scan finished.');
    } finally {
        await app.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
