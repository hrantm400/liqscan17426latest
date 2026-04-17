import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const fullAccessPlan = {
  name: 'Full Access',
  description: 'All features: unlimited pairs, all timeframes, REV+/RUN+, Order Blocks, RSI Divergence. 30 days.',
  tier: 'FULL_ACCESS',
  tierNumber: 1,
  price: 49,
  priceMonthly: 49,
  priceYearly: 490,
  duration: 30,
  markets: ['crypto', 'forex', 'indices', 'commodities'],
  pairsLimit: null as number | null,
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
};

async function main() {
  const existing = await prisma.subscription.findFirst({
    where: { tier: 'FULL_ACCESS' },
  });

  if (existing) {
    console.log('Full Access plan already exists. Nothing to do.');
    return;
  }

  await prisma.subscription.create({
    data: {
      ...fullAccessPlan,
      markets: JSON.parse(JSON.stringify(fullAccessPlan.markets)),
      timeframes: JSON.parse(JSON.stringify(fullAccessPlan.timeframes)),
      signalTypes: JSON.parse(JSON.stringify(fullAccessPlan.signalTypes)),
      features: JSON.parse(JSON.stringify(fullAccessPlan.features)),
      limits: JSON.parse(JSON.stringify(fullAccessPlan.limits)),
    },
  });

  console.log('Full Access plan created successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
