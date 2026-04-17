/**
 * Delete ALL signals (all patterns / strategies) from the main signals table.
 * Use when you want to completely reset scanner state and start from zero.
 *
 * WARNING: This removes SuperEngulfing, ICT Bias, RSI, CRT и т.д. — всё.
 *
 * Usage: npx ts-node scripts/wipe-se-signals.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function wipe() {
    console.log('=== Wipe ALL signals (all strategies) ===\n');

    const result = await prisma.superEngulfingSignal.deleteMany({});

    console.log(`Deleted ${result.count} signals from superEngulfingSignal table.`);
    await prisma.$disconnect();
}

wipe().catch(err => {
    console.error('Wipe failed:', err);
    prisma.$disconnect();
    process.exit(1);
});
