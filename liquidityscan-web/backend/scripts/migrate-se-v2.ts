/**
 * SE Scanner v2 Migration Script
 * 
 * Backfills new SE v2 fields from existing data in the database.
 * Run this script once after deploying the schema changes.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-se-v2.ts
 *   
 * Or compile first:
 *   npx tsc scripts/migrate-se-v2.ts
 *   node scripts/migrate-se-v2.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map legacy pattern types to v2 pattern names
function mapPatternToV2(signalType: string, metadata: any): string | null {
    // Check metadata.type first (most reliable)
    const type = metadata?.type || signalType;
    
    const map: Record<string, string> = {
        'run_bull': 'RUN_BULLISH',
        'run_bear': 'RUN_BEARISH',
        'run_bull_plus': 'RUN_PLUS_BULLISH',
        'run_bear_plus': 'RUN_PLUS_BEARISH',
        'rev_bull': 'REV_BULLISH',
        'rev_bear': 'REV_BEARISH',
        'rev_bull_plus': 'REV_PLUS_BULLISH',
        'rev_bear_plus': 'REV_PLUS_BEARISH',
        // Handle uppercase variants
        'RUN': 'RUN_BULLISH', // Fallback
        'RUN_PLUS': 'RUN_PLUS_BULLISH', // Fallback
        'REV': 'REV_BULLISH', // Fallback
        'REV_PLUS': 'REV_PLUS_BULLISH', // Fallback
    };
    
    // Try type field
    if (type && map[type]) {
        return map[type];
    }
    
    // Try pattern field from metadata
    const pattern = metadata?.pattern;
    if (pattern) {
        const direction = metadata?.direction === 'BEAR' ? 'BEARISH' : 'BULLISH';
        if (pattern === 'RUN') return `RUN_${direction}`;
        if (pattern === 'RUN_PLUS') return `RUN_PLUS_${direction}`;
        if (pattern === 'REV') return `REV_${direction}`;
        if (pattern === 'REV_PLUS') return `REV_PLUS_${direction}`;
    }
    
    return null;
}

// Map legacy direction to v2 direction
function mapDirectionToV2(direction: string): string {
    if (direction === 'BULL' || direction === 'BUY' || direction === 'bullish') {
        return 'bullish';
    }
    return 'bearish';
}

// Get max_candles based on timeframe per spec
function getMaxCandlesForTimeframe(timeframe: string): number {
    switch (timeframe.toLowerCase()) {
        case '4h': return 10;
        case '1d': return 4;
        case '1w': return 2;
        default: return 10;
    }
}

// Map legacy lifecycle status to v2 state
function mapLifecycleToState(lifecycleStatus: string): 'live' | 'closed' {
    if (lifecycleStatus === 'PENDING' || lifecycleStatus === 'ACTIVE') {
        return 'live';
    }
    return 'closed';
}

// Map legacy result to v2 result
function mapResultToV2(result: string | null, lifecycleStatus: string): 'won' | 'lost' | null {
    if (lifecycleStatus === 'PENDING' || lifecycleStatus === 'ACTIVE') {
        return null;
    }
    if (result === 'WIN') return 'won';
    if (result === 'LOSS') return 'lost';
    return 'lost'; // Default closed signals to lost if no result
}

// Map legacy close reason to v2 result_type
function mapCloseReasonToResultType(se_close_reason: string | null, se_r_ratio_hit: boolean): string | null {
    if (!se_close_reason) return null;
    
    switch (se_close_reason) {
        case 'TP2': return 'tp2_full';
        case 'SL': return se_r_ratio_hit ? 'tp1' : 'sl';
        case 'EXPIRED': return se_r_ratio_hit ? 'tp1' : 'candle_expiry';
        case 'OPPOSITE_REV': return se_r_ratio_hit ? 'tp1' : 'sl'; // Treat as SL
        default: return null;
    }
}

async function migrate() {
    console.log('Starting SE Scanner v2 migration...');
    
    // Get all SUPER_ENGULFING signals
    const signals = await prisma.superEngulfingSignal.findMany({
        where: {
            strategyType: 'SUPER_ENGULFING',
        },
    });
    
    console.log(`Found ${signals.length} SE signals to migrate.`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const signal of signals) {
        try {
            // Skip if already has v2 fields populated
            if (signal.state && signal.direction_v2) {
                skipped++;
                continue;
            }
            
            const metadata = signal.metadata as any;
            const state = mapLifecycleToState(signal.lifecycleStatus);
            const direction_v2 = mapDirectionToV2(signal.direction || metadata?.direction || 'BULL');
            const pattern_v2 = mapPatternToV2(signal.signalType, metadata);
            const result_v2 = mapResultToV2(signal.result, signal.lifecycleStatus);
            const result_type = mapCloseReasonToResultType(signal.se_close_reason, signal.se_r_ratio_hit);
            
            // Calculate delete_at for closed signals
            let delete_at: Date | null = null;
            if (state === 'closed' && signal.closedAt) {
                delete_at = new Date(signal.closedAt.getTime() + 48 * 60 * 60 * 1000);
            }
            
            // Update signal with v2 fields
            await prisma.superEngulfingSignal.update({
                where: { id: signal.id },
                data: {
                    state,
                    type_v2: 'se',
                    pattern_v2,
                    direction_v2,
                    entry_price: signal.se_entry_zone ?? Number(signal.price),
                    sl_price: signal.se_sl,
                    current_sl_price: signal.se_current_sl ?? signal.se_sl,
                    tp1_price: signal.se_tp1,
                    tp2_price: signal.se_tp2,
                    tp1_hit: signal.se_r_ratio_hit,
                    tp2_hit: signal.se_close_reason === 'TP2',
                    result_v2,
                    result_type,
                    candle_count: signal.candles_tracked,
                    max_candles: signal.max_candles ?? getMaxCandlesForTimeframe(signal.timeframe),
                    triggered_at: signal.detectedAt,
                    closed_at_v2: signal.closedAt,
                    delete_at,
                },
            });
            
            migrated++;
        } catch (err) {
            console.error(`Error migrating signal ${signal.id}:`, err);
            errors++;
        }
    }
    
    console.log('Migration complete!');
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped (already migrated): ${skipped}`);
    console.log(`  Errors: ${errors}`);
}

migrate()
    .catch((e) => {
        console.error('Migration failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
