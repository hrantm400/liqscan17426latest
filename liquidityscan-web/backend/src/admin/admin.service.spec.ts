// Stub ESM-only deps pulled in transitively via TelegramService → satori-html.
// We never exercise image-card rendering in these unit tests.
jest.mock('satori-html', () => ({ html: jest.fn() }));
jest.mock('satori', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@resvg/resvg-js', () => ({ Resvg: jest.fn() }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

type AnyFn = (...args: any[]) => any;

function makeDelegate(overrides: Record<string, AnyFn> = {}) {
  return {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makePrismaMock() {
  const tx: Record<string, any> = {
    payment: makeDelegate(),
    user: makeDelegate(),
    userSubscription: makeDelegate(),
    affiliateReferral: makeDelegate(),
    affiliate: makeDelegate(),
  };
  const prisma: Record<string, any> = {
    payment: makeDelegate(),
    user: makeDelegate(),
    userSubscription: makeDelegate(),
    affiliateReferral: makeDelegate(),
    affiliate: makeDelegate(),
    $transaction: jest.fn(async (cb: (t: any) => Promise<any>, _opts?: any) => {
      return cb(tx);
    }),
  };
  return { prisma, tx };
}

function makeService(prisma: any) {
  return new AdminService(
    prisma,
    {} as any, // paymentsService
    {} as any, // mailService
    {} as any, // telegramService
    {} as any, // appConfig
  );
}

const PAYMENT_ID = 'pay_test_1';
const USER_ID = 'usr_test_1';

const completedPayment = {
  id: PAYMENT_ID,
  userId: USER_ID,
  amount: 49,
  status: 'completed',
  subscriptionId: 'sub_cat_1',
  paymentMethod: 'crypto_trc20',
  metadata: { plan: 'monthly' },
  user: { id: USER_ID, email: 'u@test.com', tier: 'PAID_MONTHLY' },
};

const pendingPayment = {
  ...completedPayment,
  status: 'pending',
  user: { ...completedPayment.user, tier: 'FREE' },
};

describe('AdminService.refundCompletedPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: completed payment with affiliate → payment refunded, user downgraded, subscription cancelled, referral CHURNED, affiliate decremented, $transaction called once with ReadCommitted + 15s timeout', async () => {
    const { prisma, tx } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(completedPayment);

    tx.userSubscription.findFirst.mockResolvedValue({
      id: 'us_1',
      userId: USER_ID,
      paymentId: PAYMENT_ID,
      status: 'active',
    });
    tx.affiliateReferral.findUnique.mockResolvedValue({
      id: 'ref_1',
      affiliateId: 'aff_1',
      referredUserId: USER_ID,
      commission: 14.7,
      status: 'CONVERTED',
      affiliate: { id: 'aff_1', code: 'REFAFF', tier: 'STANDARD', totalSales: 5, totalEarned: 100 },
    });

    const svc = makeService(prisma);
    const result = await svc.refundCompletedPayment(PAYMENT_ID);

    expect(result).toEqual({ success: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const opts = (prisma.$transaction.mock.calls[0] as any[])[1];
    expect(opts).toEqual(
      expect.objectContaining({
        maxWait: 5000,
        timeout: 15000,
      }),
    );

    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAYMENT_ID },
        data: { status: 'refunded' },
      }),
    );

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          tier: 'FREE',
          subscriptionStatus: 'cancelled',
          subscriptionId: null,
        }),
      }),
    );

    expect(tx.userSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'us_1' },
        data: expect.objectContaining({ status: 'cancelled' }),
      }),
    );

    expect(tx.affiliate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'aff_1' },
        data: { totalSales: 4, totalEarned: 85.3 },
      }),
    );

    expect(tx.affiliateReferral.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ref_1' },
        data: { status: 'CHURNED' },
      }),
    );
  });

  it('without affiliate: no referral row → payment/user/userSubscription updated, no affiliate writes, no [AFFILIATE_REVERSAL_FAILED] log', async () => {
    const { prisma, tx } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(completedPayment);
    tx.userSubscription.findFirst.mockResolvedValue({ id: 'us_1', status: 'active' });
    tx.affiliateReferral.findUnique.mockResolvedValue(null);

    const svc = makeService(prisma);
    const logErr = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);

    await svc.refundCompletedPayment(PAYMENT_ID);

    expect(tx.payment.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.userSubscription.update).toHaveBeenCalledTimes(1);
    expect(tx.affiliate.update).not.toHaveBeenCalled();
    expect(tx.affiliateReferral.update).not.toHaveBeenCalled();

    const loggedArgs = logErr.mock.calls.flat().map((a) => String(a));
    expect(loggedArgs.some((s) => s.includes('[AFFILIATE_REVERSAL_FAILED]'))).toBe(false);

    logErr.mockRestore();
  });

  it('idempotent: already refunded → returns early, no $transaction call', async () => {
    const { prisma } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue({ ...completedPayment, status: 'refunded' });

    const svc = makeService(prisma);
    const result = await svc.refundCompletedPayment(PAYMENT_ID);

    expect(result).toEqual({ success: true, alreadyRefunded: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects non-completed (pending/failed/cancelled) with BadRequestException', async () => {
    for (const status of ['pending', 'failed', 'cancelled']) {
      const { prisma } = makePrismaMock();
      prisma.payment.findUnique.mockResolvedValue({ ...completedPayment, status });
      const svc = makeService(prisma);

      await expect(svc.refundCompletedPayment(PAYMENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it('missing payment row throws NotFoundException', async () => {
    const { prisma } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(null);
    const svc = makeService(prisma);

    await expect(svc.refundCompletedPayment('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('affiliate failure does NOT block: [AFFILIATE_REVERSAL_FAILED] logged, payment/user/userSubscription commits succeed', async () => {
    const { prisma, tx } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(completedPayment);
    tx.userSubscription.findFirst.mockResolvedValue({ id: 'us_1', status: 'active' });
    tx.affiliateReferral.findUnique.mockRejectedValue(new Error('affiliate lookup exploded'));

    const svc = makeService(prisma);
    const logErr = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);

    const result = await svc.refundCompletedPayment(PAYMENT_ID);

    expect(result).toEqual({ success: true });
    expect(tx.payment.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.userSubscription.update).toHaveBeenCalledTimes(1);
    expect(tx.affiliate.update).not.toHaveBeenCalled();
    expect(tx.affiliateReferral.update).not.toHaveBeenCalled();

    const loggedArgs = logErr.mock.calls.flat().map((a) => String(a));
    expect(loggedArgs.some((s) => s.includes('[AFFILIATE_REVERSAL_FAILED]'))).toBe(true);
    expect(loggedArgs.some((s) => s.includes(PAYMENT_ID))).toBe(true);

    logErr.mockRestore();
  });

  it('underflow guard: Affiliate.totalSales=0, totalEarned=0 → clamped to 0, [AFFILIATE_REVERSAL_UNDERFLOW] warning logged', async () => {
    const { prisma, tx } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(completedPayment);
    tx.userSubscription.findFirst.mockResolvedValue({ id: 'us_1', status: 'active' });
    tx.affiliateReferral.findUnique.mockResolvedValue({
      id: 'ref_1',
      affiliateId: 'aff_1',
      referredUserId: USER_ID,
      commission: 14.7,
      status: 'CONVERTED',
      affiliate: { id: 'aff_1', code: 'ZEROAFF', tier: 'STANDARD', totalSales: 0, totalEarned: 0 },
    });

    const svc = makeService(prisma);
    const logWarn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);

    await svc.refundCompletedPayment(PAYMENT_ID);

    expect(tx.affiliate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { totalSales: 0, totalEarned: 0 },
      }),
    );

    const warnArgs = logWarn.mock.calls.flat().map((a) => String(a));
    expect(warnArgs.some((s) => s.includes('[AFFILIATE_REVERSAL_UNDERFLOW]'))).toBe(true);

    logWarn.mockRestore();
  });
});

describe('AdminService.cancelPendingPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pending → cancelled: updates status', async () => {
    const { prisma } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(pendingPayment);
    const svc = makeService(prisma);

    const result = await svc.cancelPendingPayment(PAYMENT_ID);

    expect(result).toEqual({ success: true });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAYMENT_ID },
        data: { status: 'cancelled' },
      }),
    );
  });

  it('completed → BadRequestException mentioning refund endpoint', async () => {
    const { prisma } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(completedPayment);
    const svc = makeService(prisma);

    await expect(svc.cancelPendingPayment(PAYMENT_ID)).rejects.toThrow(
      /use refund endpoint/,
    );
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('already cancelled → idempotent no-op', async () => {
    const { prisma } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue({ ...pendingPayment, status: 'cancelled' });
    const svc = makeService(prisma);

    const result = await svc.cancelPendingPayment(PAYMENT_ID);

    expect(result).toEqual({ success: true, alreadyCancelled: true });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
