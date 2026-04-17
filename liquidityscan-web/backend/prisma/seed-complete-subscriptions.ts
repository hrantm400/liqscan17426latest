import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Refreshing subscriptions...');

    // 1. Find or create SCOUT (Free Forever)
    let scout = await prisma.subscription.findFirst({ where: { tier: 'SCOUT' } });

    if (!scout) {
        scout = await prisma.subscription.create({
            data: {
                name: 'Free Forever',
                description: 'Basic access to main assets. Proves our 90%+ win rate.',
                tier: 'SCOUT',
                tierNumber: 0,
                price: 0,
                priceMonthly: 0,
                duration: 9999,
                markets: JSON.parse(JSON.stringify(['crypto', 'forex'])),
                pairsLimit: 4,
                timeframes: JSON.parse(JSON.stringify(['4H', 'Daily'])),
                signalTypes: JSON.parse(JSON.stringify(['Standard'])),
                features: JSON.parse(JSON.stringify([
                    'Standard signals only',
                    '4 pairs: BTC, ETH, EURUSD, XAUUSD',
                    '4H and Daily timeframes only',
                    'Telegram notifications included',
                ])),
                limits: JSON.parse(JSON.stringify({
                    markets: ['crypto', 'forex'],
                    pairs: ['BTC', 'ETH', 'EURUSD', 'XAUUSD'],
                })),
                isPopular: false,
                isActive: true,
                sortOrder: 0,
            },
        });
        console.log('Created SCOUT subscription.');
    }

    // 2. Identify all other subscriptions to remove/merge
    const others = await prisma.subscription.findMany({
        where: { id: { not: scout.id } }
    });

    if (others.length > 0) {
        const otherIds = others.map(o => o.id);
        console.log(`Cleaning up ${others.length} legacy subscriptions...`);

        // Migrate users to Scout
        await prisma.user.updateMany({
            where: { subscriptionId: { in: otherIds } },
            data: { subscriptionId: scout.id }
        });

        // Clean up history and records
        await prisma.userSubscription.deleteMany({ where: { subscriptionId: { in: otherIds } } });
        await prisma.course.updateMany({ where: { subscriptionId: { in: otherIds } }, data: { subscriptionId: null } });
        await prisma.payment.updateMany({ where: { subscriptionId: { in: otherIds } }, data: { subscriptionId: null } });

        // Delete them
        await prisma.subscription.deleteMany({ where: { id: { in: otherIds } } });
    }

    // 3. Create FULL_ACCESS plan
    const fullAccess = await prisma.subscription.create({
        data: {
            name: 'Full Access',
            description: 'Unlock 500+ pairs, all timeframes, REV+/RUN+, and Telegram God Mode alerts.',
            tier: 'FULL_ACCESS',
            tierNumber: 1,
            price: 49,
            priceMonthly: 49,
            priceYearly: 490,
            duration: 30,
            markets: JSON.parse(JSON.stringify(['crypto', 'forex', 'indices', 'commodities'])),
            pairsLimit: null,
            timeframes: JSON.parse(JSON.stringify(['1h', '4H', 'Daily', '1W'])),
            signalTypes: JSON.parse(JSON.stringify(['Standard', 'REV+', 'RUN+'])),
            features: JSON.parse(JSON.stringify([
                'Unlimited 500+ pairs (all symbols)',
                'All timeframes: 1H, 4H, Daily, 1W',
                'Standard + REV+ / RUN+ signals',
                'Strategy context filters (OB/RSI)',
                'Telegram God Mode alerts',
            ])),
            limits: JSON.parse(JSON.stringify({
                contextFilters: true,
            })),
            isPopular: true,
            isActive: true,
            sortOrder: 1,
        },
    });
    console.log('Created FULL_ACCESS subscription.');

    console.log('Seeding complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
