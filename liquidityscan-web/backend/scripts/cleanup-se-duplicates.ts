/**
 * Cleanup old-format SE signal duplicates.
 * 
 * Old format ID: SUPER_ENGULFING-{symbol}-{timeframe}-{timestamp}
 * New format ID: SUPER_ENGULFING-{symbol}-{timeframe}-{pattern_v2}-{timestamp}
 * 
 * This script finds all new-format signals, derives the old-format ID,
 * and deletes any old-format signal that still exists.
 * 
 * Usage: npx ts-node scripts/cleanup-se-duplicates.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PATTERN_V2_VALUES = [
    'RUN_BULLISH', 'RUN_BEARISH',
    'RUN_PLUS_BULLISH', 'RUN_PLUS_BEARISH',
    'REV_BULLISH', 'REV_BEARISH',
    'REV_PLUS_BULLISH', 'REV_PLUS_BEARISH',
];

async function cleanup() {
    console.log('=== SE Duplicate Cleanup ===\n');

    const allSe = await prisma.superEngulfingSignal.findMany({
        where: { strategyType: 'SUPER_ENGULFING' },
        select: { id: true, symbol: true, timeframe: true, pattern_v2: true },
    });

    console.log(`Total SE signals: ${allSe.length}`);

    // Find new-format signals (ID contains a pattern_v2 value)
    const newFormat = allSe.filter(s =>
        PATTERN_V2_VALUES.some(p => s.id.includes(`-${p}-`))
    );

    console.log(`New-format signals: ${newFormat.length}`);

    // For each new-format signal, derive the old-format ID and collect for deletion
    const oldIdsToDelete: string[] = [];

    for (const sig of newFormat) {
        // Extract parts: SUPER_ENGULFING-{symbol}-{tf}-{pattern}-{timestamp}
        // Old format:    SUPER_ENGULFING-{symbol}-{tf}-{timestamp}
        // We need to remove the pattern segment
        for (const pat of PATTERN_V2_VALUES) {
            if (sig.id.includes(`-${pat}-`)) {
                const oldId = sig.id.replace(`-${pat}-`, '-');
                oldIdsToDelete.push(oldId);
                break;
            }
        }
    }

    // Deduplicate
    const uniqueOldIds = [...new Set(oldIdsToDelete)];
    console.log(`Potential old-format IDs to check: ${uniqueOldIds.length}`);

    // Check which ones actually exist
    const existing = await prisma.superEngulfingSignal.findMany({
        where: { id: { in: uniqueOldIds } },
        select: { id: true },
    });

    console.log(`Old-format duplicates found in DB: ${existing.length}`);

    if (existing.length === 0) {
        console.log('\nNo duplicates to delete. Done!');
        await prisma.$disconnect();
        return;
    }

    // Delete them
    const idsToDelete = existing.map(e => e.id);
    console.log('\nDeleting old-format duplicates:');
    for (const id of idsToDelete) {
        console.log(`  - ${id}`);
    }

    const result = await prisma.superEngulfingSignal.deleteMany({
        where: { id: { in: idsToDelete } },
    });

    console.log(`\nDeleted ${result.count} old-format duplicate signals.`);
    await prisma.$disconnect();
}

cleanup().catch(err => {
    console.error('Cleanup failed:', err);
    prisma.$disconnect();
    process.exit(1);
});
