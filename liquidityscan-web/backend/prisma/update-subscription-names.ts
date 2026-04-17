import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Updating subscription names...');

  const nameUpdates = [
    { tier: 'SCOUT', name: 'Free Forever' },
  ];

  for (const update of nameUpdates) {
    const result = await prisma.subscription.updateMany({
      where: { tier: update.tier },
      data: { name: update.name },
    });
    console.log(`Updated ${result.count} subscription(s) with tier ${update.tier} to name "${update.name}"`);
  }

  console.log('Subscription names updated successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
