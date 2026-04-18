/**
 * PR 2.5 Part A — live smoke test for refund/cancel rollback.
 *
 * Namespace-isolated test data (zero impact on real users):
 *   user.email           = user@smoke-pr25a.test
 *   affiliate.user.email = affiliate@smoke-pr25a.test
 *   subscription.name    = SMOKE_TEST_PR25A
 *   affiliate.code       = SMOKE25A
 *
 * Scenarios:
 *   1. cancelPendingPayment on a pending payment  → status = 'cancelled' + idempotent re-cancel
 *   2. refundCompletedPayment on a completed payment → full rollback + affiliate CHURNED
 *   3. CHURNED → CONVERTED resurrection via processSubscriptionPayment
 *   4. Idempotent re-refund on already-refunded payment + BadRequest on non-completed
 *
 * Cleanup runs in a transaction regardless of outcome.
 *
 * Usage (from backend dir):
 *   node --experimental-require-module scripts/smoke-pr25a.js
 *
 * We use the compiled dist/ + --experimental-require-module because
 * TelegramService transitively requires `satori-html` (ESM-only), and
 * Node 20 CJS cannot `require()` ESM without this flag.
 */

const { PrismaClient } = require('@prisma/client');
const { AdminService } = require('../dist/src/admin/admin.service.js');
const { PaymentsService } = require('../dist/src/payments/payments.service.js');

const EMAIL = 'user@smoke-pr25a.test';
const AFF_EMAIL = 'affiliate@smoke-pr25a.test';
const SUB_NAME = 'SMOKE_TEST_PR25A';
const AFF_CODE = 'SMOKE25A';

function line(char = '\u2500') {
  console.log(char.repeat(78));
}
function title(s) {
  line('\u2550');
  console.log('  ' + s);
  line('\u2550');
}
function sub(s) {
  line('\u2500');
  console.log('  ' + s);
  line('\u2500');
}

async function snapshot(prisma, label, userId, affiliateId, referralId, paymentId) {
  const [user, affiliate, referral, payment, userSub] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, tier: true, subscriptionStatus: true, subscriptionId: true, subscriptionExpiresAt: true,
      },
    }),
    prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: { id: true, code: true, totalSales: true, totalEarned: true },
    }),
    referralId
      ? prisma.affiliateReferral.findUnique({
          where: { id: referralId },
          select: { id: true, status: true, commission: true, paymentAmount: true },
        })
      : null,
    paymentId
      ? prisma.payment.findUnique({
          where: { id: paymentId },
          select: { id: true, status: true, amount: true },
        })
      : null,
    paymentId
      ? prisma.userSubscription.findFirst({
          where: { paymentId },
          select: { id: true, status: true, endDate: true },
        })
      : null,
  ]);
  console.log('[' + label + ']');
  console.log('  user        :', JSON.stringify(user));
  console.log('  affiliate   :', JSON.stringify(affiliate));
  console.log('  referral    :', JSON.stringify(referral));
  console.log('  payment     :', JSON.stringify(payment));
  console.log('  userSub     :', JSON.stringify(userSub));
}

async function fullCleanup(prisma) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: EMAIL } });
    const affUser = await tx.user.findUnique({ where: { email: AFF_EMAIL } });
    const affiliate = await tx.affiliate.findUnique({ where: { code: AFF_CODE } });
    const subscription = await tx.subscription.findFirst({ where: { name: SUB_NAME } });

    if (user) {
      await tx.userSubscription.deleteMany({ where: { userId: user.id } });
      await tx.payment.deleteMany({ where: { userId: user.id } });
      await tx.affiliateReferral.deleteMany({ where: { referredUserId: user.id } });
    }
    if (affiliate) {
      await tx.affiliateReferral.deleteMany({ where: { affiliateId: affiliate.id } });
      await tx.affiliate.delete({ where: { id: affiliate.id } }).catch(() => undefined);
    }
    if (user) await tx.user.delete({ where: { id: user.id } }).catch(() => undefined);
    if (affUser) await tx.user.delete({ where: { id: affUser.id } }).catch(() => undefined);
    if (subscription) {
      await tx.subscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
    }
  });
  console.log('  cleanup complete: smoke namespace purged');
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const stubMail = {
    sendMail: async () => ({ ok: true }),
    sendPaymentReceipt: async () => undefined,
  };
  const stubTelegram = { sendMessage: async () => undefined };
  const stubAppConfig = { get: (_k) => undefined };

  const payments = new PaymentsService(prisma, stubMail);
  const admin = new AdminService(prisma, payments, stubMail, stubTelegram, stubAppConfig);

  let ok = true;

  try {
    title('PR 2.5 Part A smoke — SETUP');
    await fullCleanup(prisma); // defensive pre-cleanup

    let subscription = await prisma.subscription.findFirst({ where: { name: SUB_NAME } });
    if (!subscription) {
      subscription = await prisma.subscription.create({
        data: {
          name: SUB_NAME,
          description: 'PR 2.5 Part A smoke catalog row',
          tier: 'SPECIALIST',
          price: 49,
          priceMonthly: 49,
          duration: 30,
          isActive: false,
        },
      });
    }

    const affiliateUser = await prisma.user.upsert({
      where: { email: AFF_EMAIL },
      update: {},
      create: { email: AFF_EMAIL, password: 'smoke-disabled', tier: 'FREE' },
    });

    const affiliate = await prisma.affiliate.upsert({
      where: { code: AFF_CODE },
      update: { totalSales: 0, totalEarned: 0 },
      create: {
        userId: affiliateUser.id, code: AFF_CODE, tier: 'STANDARD',
        totalSales: 0, totalEarned: 0,
      },
    });

    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      update: {
        tier: 'FREE', subscriptionStatus: 'none',
        subscriptionId: null, subscriptionExpiresAt: null,
      },
      create: { email: EMAIL, password: 'smoke-disabled', tier: 'FREE' },
    });

    const referral = await prisma.affiliateReferral.upsert({
      where: { referredUserId: user.id },
      update: { status: 'REGISTERED', paymentAmount: null, commission: null },
      create: {
        affiliateId: affiliate.id, referredUserId: user.id, status: 'REGISTERED',
      },
    });

    console.log('Seeded:', {
      subscriptionId: subscription.id,
      affiliateId: affiliate.id,
      affiliateUserId: affiliateUser.id,
      userId: user.id,
      referralId: referral.id,
    });

    // ───────────────────────────────────────────────────────────
    // SCENARIO 1
    // ───────────────────────────────────────────────────────────
    title('SCENARIO 1 — cancelPendingPayment (pending -> cancelled)');
    const pendingPayment = await prisma.payment.create({
      data: {
        userId: user.id, amount: 49, status: 'pending',
        paymentMethod: 'crypto_trc20', subscriptionId: subscription.id,
        metadata: { smokeScenario: 1 },
      },
    });
    console.log('  created pending payment:', pendingPayment.id);

    await snapshot(prisma, 'BEFORE cancel', user.id, affiliate.id, referral.id, pendingPayment.id);
    const cancelResult = await admin.cancelPendingPayment(pendingPayment.id);
    console.log('  cancelPendingPayment ->', JSON.stringify(cancelResult));
    await snapshot(prisma, 'AFTER cancel', user.id, affiliate.id, referral.id, pendingPayment.id);

    const cancelled = await prisma.payment.findUnique({ where: { id: pendingPayment.id } });
    if (cancelled && cancelled.status === 'cancelled') console.log('  OK payment.status = cancelled');
    else { console.error('  FAIL expected cancelled, got', cancelled && cancelled.status); ok = false; }

    const cancelResult2 = await admin.cancelPendingPayment(pendingPayment.id);
    if (cancelResult2.alreadyCancelled) console.log('  OK re-cancel idempotent:', JSON.stringify(cancelResult2));
    else { console.error('  FAIL expected alreadyCancelled=true, got', JSON.stringify(cancelResult2)); ok = false; }

    // ───────────────────────────────────────────────────────────
    // SCENARIO 2
    // ───────────────────────────────────────────────────────────
    title('SCENARIO 2 — refundCompletedPayment (completed -> full rollback)');
    const payment2 = await prisma.payment.create({
      data: {
        userId: user.id, amount: 49, status: 'pending',
        paymentMethod: 'crypto_trc20', subscriptionId: subscription.id,
        metadata: { smokeScenario: 2 },
      },
    });
    console.log('  created pending payment:', payment2.id);

    const processResult = await payments.processSubscriptionPayment(payment2.id);
    console.log('  processSubscriptionPayment ->', JSON.stringify(processResult));

    await snapshot(prisma, 'BEFORE refund', user.id, affiliate.id, referral.id, payment2.id);

    const affBefore = await prisma.affiliate.findUnique({ where: { id: affiliate.id } });
    const refBefore = await prisma.affiliateReferral.findUnique({ where: { id: referral.id } });

    const refundResult = await admin.refundCompletedPayment(payment2.id);
    console.log('  refundCompletedPayment ->', JSON.stringify(refundResult));

    await snapshot(prisma, 'AFTER refund', user.id, affiliate.id, referral.id, payment2.id);

    const p2 = await prisma.payment.findUnique({ where: { id: payment2.id } });
    const u2 = await prisma.user.findUnique({ where: { id: user.id } });
    const us2 = await prisma.userSubscription.findFirst({ where: { paymentId: payment2.id } });
    const ref2 = await prisma.affiliateReferral.findUnique({ where: { id: referral.id } });
    const aff2 = await prisma.affiliate.findUnique({ where: { id: affiliate.id } });

    if (p2 && p2.status === 'refunded') console.log('  OK payment.status = refunded'); else { console.error('  FAIL payment.status:', p2 && p2.status); ok = false; }
    if (u2 && u2.tier === 'FREE') console.log('  OK user.tier = FREE'); else { console.error('  FAIL user.tier:', u2 && u2.tier); ok = false; }
    if (u2 && u2.subscriptionStatus === 'cancelled') console.log('  OK user.subscriptionStatus = cancelled'); else { console.error('  FAIL user.subscriptionStatus:', u2 && u2.subscriptionStatus); ok = false; }
    if (u2 && u2.subscriptionId === null) console.log('  OK user.subscriptionId = null'); else { console.error('  FAIL user.subscriptionId:', u2 && u2.subscriptionId); ok = false; }
    if (us2 && us2.status === 'cancelled') console.log('  OK userSubscription.status = cancelled'); else { console.error('  FAIL userSubscription.status:', us2 && us2.status); ok = false; }
    if (ref2 && ref2.status === 'CHURNED') console.log('  OK referral.status = CHURNED'); else { console.error('  FAIL referral.status:', ref2 && ref2.status); ok = false; }

    const expectedSales = (affBefore.totalSales || 0) - 1;
    const expectedEarned = Math.max(0, (affBefore.totalEarned || 0) - (refBefore.commission || 0));
    if (aff2.totalSales === expectedSales) console.log('  OK affiliate.totalSales decremented:', affBefore.totalSales, '->', aff2.totalSales);
    else { console.error('  FAIL affiliate.totalSales expected=', expectedSales, 'got=', aff2.totalSales); ok = false; }

    if (Math.abs(aff2.totalEarned - expectedEarned) < 1e-6) console.log('  OK affiliate.totalEarned decremented:', affBefore.totalEarned, '->', aff2.totalEarned);
    else { console.error('  FAIL affiliate.totalEarned expected=', expectedEarned, 'got=', aff2.totalEarned); ok = false; }

    // ───────────────────────────────────────────────────────────
    // SCENARIO 3
    // ───────────────────────────────────────────────────────────
    title('SCENARIO 3 — CHURNED -> CONVERTED resurrection via processSubscriptionPayment');
    const payment3 = await prisma.payment.create({
      data: {
        userId: user.id, amount: 49, status: 'pending',
        paymentMethod: 'crypto_trc20', subscriptionId: subscription.id,
        metadata: { smokeScenario: 3 },
      },
    });
    console.log('  created pending payment:', payment3.id);

    const affBeforeRes = await prisma.affiliate.findUnique({ where: { id: affiliate.id } });
    await snapshot(prisma, 'BEFORE resurrection', user.id, affiliate.id, referral.id, payment3.id);

    await payments.processSubscriptionPayment(payment3.id);

    await snapshot(prisma, 'AFTER resurrection', user.id, affiliate.id, referral.id, payment3.id);

    const ref3 = await prisma.affiliateReferral.findUnique({ where: { id: referral.id } });
    const aff3 = await prisma.affiliate.findUnique({ where: { id: affiliate.id } });
    const u3 = await prisma.user.findUnique({ where: { id: user.id } });

    if (ref3 && ref3.status === 'CONVERTED') console.log('  OK referral.status = CONVERTED (resurrected)');
    else { console.error('  FAIL referral.status:', ref3 && ref3.status); ok = false; }

    if ((aff3.totalSales || 0) === (affBeforeRes.totalSales || 0) + 1) console.log('  OK affiliate.totalSales incremented:', affBeforeRes.totalSales, '->', aff3.totalSales);
    else { console.error('  FAIL affiliate.totalSales expected=', (affBeforeRes.totalSales || 0) + 1, 'got=', aff3.totalSales); ok = false; }

    if ((aff3.totalEarned || 0) > (affBeforeRes.totalEarned || 0)) console.log('  OK affiliate.totalEarned incremented:', affBeforeRes.totalEarned, '->', aff3.totalEarned);
    else { console.error('  FAIL affiliate.totalEarned did not increase:', affBeforeRes.totalEarned, '->', aff3.totalEarned); ok = false; }

    if (u3 && u3.tier === 'PAID_MONTHLY') console.log('  OK user.tier = PAID_MONTHLY');
    else { console.error('  FAIL user.tier:', u3 && u3.tier); ok = false; }

    // ───────────────────────────────────────────────────────────
    // SCENARIO 4
    // ───────────────────────────────────────────────────────────
    title('SCENARIO 4 — idempotent re-refund on payment2 (already refunded)');
    const reRefund = await admin.refundCompletedPayment(payment2.id);
    console.log('  refundCompletedPayment(already refunded) ->', JSON.stringify(reRefund));
    if (reRefund.alreadyRefunded) console.log('  OK idempotent no-op');
    else { console.error('  FAIL expected alreadyRefunded=true, got', JSON.stringify(reRefund)); ok = false; }

    const aff4 = await prisma.affiliate.findUnique({ where: { id: affiliate.id } });
    if (aff4.totalSales === aff3.totalSales && Math.abs(aff4.totalEarned - aff3.totalEarned) < 1e-6) {
      console.log('  OK affiliate totals unchanged after no-op refund');
    } else {
      console.error('  FAIL affiliate totals changed after no-op:', JSON.stringify(aff3), '->', JSON.stringify(aff4));
      ok = false;
    }

    sub('Negative path — refund on non-completed');
    const paymentNeg = await prisma.payment.create({
      data: {
        userId: user.id, amount: 49, status: 'pending',
        paymentMethod: 'crypto_trc20', subscriptionId: subscription.id,
        metadata: { smokeScenario: '4-neg' },
      },
    });
    try {
      await admin.refundCompletedPayment(paymentNeg.id);
      console.error('  FAIL expected BadRequestException, but call succeeded');
      ok = false;
    } catch (e) {
      console.log('  OK refund rejected on non-completed:', e.message);
    }
  } catch (e) {
    console.error('\nUNEXPECTED ERROR:', e);
    ok = false;
  } finally {
    title('CLEANUP');
    await fullCleanup(prisma);
    await prisma.$disconnect();
  }

  line('\u2550');
  if (ok) {
    console.log('  ALL SMOKE SCENARIOS PASSED');
    line('\u2550');
    process.exit(0);
  } else {
    console.log('  SMOKE FAILURES DETECTED — see logs above');
    line('\u2550');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
