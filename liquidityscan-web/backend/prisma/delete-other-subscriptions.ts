/**
 * Delete all subscriptions except Free Forever (SCOUT).
 * Run once on existing DB: npx ts-node prisma/delete-other-subscriptions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const scout = await prisma.subscription.findFirst({ where: { tier: 'SCOUT' } });
  if (!scout) {
    console.log('No SCOUT (Free Forever) subscription found. Nothing to do.');
    return;
  }

  const otherIds = (
    await prisma.subscription.findMany({
      where: { tier: { not: 'SCOUT' } },
      select: { id: true },
    })
  ).map((s) => s.id);

  if (otherIds.length === 0) {
    console.log('Only Free Forever exists. Nothing to delete.');
    return;
  }

  console.log(`Found ${otherIds.length} non-SCOUT subscription(s). Migrating and deleting...`);

  // Users: point to Free Forever
  const usersUpdated = await prisma.user.updateMany({
    where: { subscriptionId: { in: otherIds } },
    data: { subscriptionId: scout.id },
  });
  console.log(`Users updated: ${usersUpdated.count}`);

  // UserSubscription: delete records for other plans
  const usDeleted = await prisma.userSubscription.deleteMany({
    where: { subscriptionId: { in: otherIds } },
  });
  console.log(`UserSubscription deleted: ${usDeleted.count}`);

  // Payment: clear subscriptionId for other plans
  const paymentsUpdated = await prisma.payment.updateMany({
    where: { subscriptionId: { in: otherIds } },
    data: { subscriptionId: null },
  });
  console.log(`Payments cleared: ${paymentsUpdated.count}`);

  // Course: clear subscriptionId for other plans
  const coursesUpdated = await prisma.course.updateMany({
    where: { subscriptionId: { in: otherIds } },
    data: { subscriptionId: null },
  });
  console.log(`Courses cleared: ${coursesUpdated.count}`);

  // ChapterSubscription: cascade on delete, so just delete subscriptions
  const subsDeleted = await prisma.subscription.deleteMany({
    where: { id: { in: otherIds } },
  });
  console.log(`Subscriptions deleted: ${subsDeleted.count}`);

  console.log('Done. Only Free Forever (SCOUT) remains.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
