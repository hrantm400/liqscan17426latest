import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding subscriptions...');

  // Check if subscriptions already exist
  const existing = await prisma.subscription.count();
  if (existing > 0) {
    console.log('Subscriptions already exist, skipping seed...');
    return;
  }

  const subscriptions = [
    {
      name: 'Free Forever',
      description: 'The "Drug." Get addicted to notifications. Target: Skeptics and beginners. Proves win rate on the biggest assets.',
      tier: 'SCOUT',
      tierNumber: 0,
      price: 0,
      priceMonthly: 0,
      duration: 9999, // Forever
      markets: ['crypto', 'forex'],
      pairsLimit: 4, // BTC, ETH (Crypto) or EURUSD, XAUUSD (Forex)
      timeframes: ['4H', 'Daily'],
      signalTypes: ['Standard'],
      features: [
        'Standard REV/RUN signals only (no REV+, RUN+)',
        '4 pairs: BTC, ETH, EURUSD, XAUUSD',
        '4H and Daily timeframes only (patient trading)',
        'No context filters (no Order Blocks, no RSI Divergence)',
        'Notifications included',
      ],
      limits: {
        markets: ['crypto', 'forex'],
        pairs: ['BTC', 'ETH', 'EURUSD', 'XAUUSD'],
        contextFilters: false, // No Order Blocks, no RSI Divergence
      },
      isPopular: false,
      isActive: true,
      sortOrder: 0,
    },
    {
      name: 'Full Access',
      description: 'All features: unlimited pairs, all timeframes, REV+/RUN+, Order Blocks, RSI Divergence. 30 days.',
      tier: 'FULL_ACCESS',
      tierNumber: 1,
      price: 49,
      priceMonthly: 49,
      priceYearly: 490,
      duration: 30,
      markets: ['crypto', 'forex', 'indices', 'commodities'],
      pairsLimit: null, // unlimited
      timeframes: ['1h', '4H', 'Daily', '1W'],
      signalTypes: ['Standard', 'REV+', 'RUN+'],
      features: [
        'Unlimited pairs (all symbols)',
        'All timeframes: 1H, 4H, Daily, 1W',
        'Standard + REV+ / RUN+ signals',
        'Order Blocks and RSI Divergence (context filters)',
        'Notifications included',
      ],
      limits: {
        contextFilters: true,
      },
      isPopular: true,
      isActive: true,
      sortOrder: 1,
    },
  ];

  for (const sub of subscriptions) {
    await prisma.subscription.create({
      data: {
        ...sub,
        markets: JSON.parse(JSON.stringify(sub.markets)),
        timeframes: JSON.parse(JSON.stringify(sub.timeframes)),
        signalTypes: JSON.parse(JSON.stringify(sub.signalTypes)),
        features: JSON.parse(JSON.stringify(sub.features)),
        limits: JSON.parse(JSON.stringify(sub.limits)),
      },
    });
    console.log(`Created subscription: ${sub.name}`);
  }

  console.log('Subscriptions seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
