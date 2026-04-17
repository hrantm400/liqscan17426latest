import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type UpdateData = {
  name: string;
  description: string;
  pairsLimit: number;
  timeframes: string[];
  signalTypes: string[];
  features: string[];
  limits: { markets: string[]; pairs: string[]; contextFilters: boolean };
  markets: string[];
  isPopular?: boolean;
  price?: number;
  priceMonthly?: number;
};

async function main() {
  console.log('Updating subscription details...');

  const updates: { tier: string; data: UpdateData }[] = [
    {
      tier: 'SCOUT',
      data: {
        name: 'Free Forever',
        description: 'The "Drug." Get addicted to notifications. Target: Skeptics and beginners. Proves win rate on the biggest assets. For altcoins or faster trading, upgrade.',
        pairsLimit: 4,
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
          contextFilters: false,
        },
        markets: ['crypto', 'forex'],
      },
    },
  ];

  for (const update of updates) {
    const updateData: any = {
      name: update.data.name,
      description: update.data.description,
      pairsLimit: update.data.pairsLimit,
      isPopular: update.data.isPopular || false,
    };

    if (update.data.price !== undefined) {
      updateData.price = update.data.price;
      updateData.priceMonthly = update.data.priceMonthly;
    }

    if (update.data.markets) {
      updateData.markets = JSON.parse(JSON.stringify(update.data.markets));
    }

    if (update.data.timeframes) {
      updateData.timeframes = JSON.parse(JSON.stringify(update.data.timeframes));
    }

    if (update.data.signalTypes) {
      updateData.signalTypes = JSON.parse(JSON.stringify(update.data.signalTypes));
    }

    if (update.data.features) {
      updateData.features = JSON.parse(JSON.stringify(update.data.features));
    }

    if (update.data.limits) {
      updateData.limits = JSON.parse(JSON.stringify(update.data.limits));
    }

    const result = await prisma.subscription.updateMany({
      where: { tier: update.tier },
      data: updateData,
    });
    console.log(`Updated ${result.count} subscription(s) with tier ${update.tier}`);
  }

  console.log('Subscription details updated successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
