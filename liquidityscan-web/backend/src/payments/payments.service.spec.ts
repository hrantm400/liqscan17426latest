import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

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
    subscription: makeDelegate(),
    affiliateReferral: makeDelegate(),
    affiliate: makeDelegate(),
    $transaction: jest.fn(async (cb: (t: any) => Promise<any>, _opts?: any) => {
      return cb(tx);
    }),
  };
  return { prisma, tx };
}

function makeMailMock() {
  return { sendMail: jest.fn().mockResolvedValue(undefined) };
}

const PAYMENT_ID = 'pay_test_1';
const USER_ID = 'usr_test_1';
const SUB_ID = 'sub_test_1';

const pendingPayment = {
  id: PAYMENT_ID,
  userId: USER_ID,
  amount: 49,
  status: 'pending',
  subscriptionId: SUB_ID,
  paymentMethod: 'crypto_trc20',
  metadata: { plan: 'monthly', network: 'TRC20' },
  user: { id: USER_ID, email: 'user@example.com', tier: 'FREE', subscriptionExpiresAt: null },
};

const completedPayment = {
  ...pendingPayment,
  status: 'completed',
  user: {
    ...pendingPayment.user,
    tier: 'PAID_MONTHLY',
    subscriptionExpiresAt: new Date('2099-01-01T00:00:00Z'),
  },
};

const subscriptionRow = {
  id: SUB_ID,
  duration: 30,
  priceMonthly: 49,
  priceYearly: null,
};

describe('PaymentsService.processSubscriptionPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: pending payment, no affiliate — wraps all writes in $transaction with ReadCommitted + 15s timeout', async () => {
    const { prisma, tx } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(pendingPayment);
    prisma.subscription.findUnique.mockResolvedValue(subscriptionRow);
    tx.affiliateReferral.findUnique.mockResolvedValue(null);
    const mail = makeMailMock();

    const svc = new PaymentsService(prisma as any, mail as any);
    const logErr = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);

    const result = await svc.processSubscriptionPayment(PAYMENT_ID);

    expect(prisma.payment.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const opts = (prisma.$transaction.mock.calls[0] as any[])[1];
    expect(opts).toEqual(
      expect.objectContaining({
        maxWait: 5000,
        timeout: 15000,
      }),
    );
    expect(String(opts.isolationLevel)).toMatch(/ReadCommitted/i);

    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAYMENT_ID },
        data: { status: 'completed' },
      }),
    );
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({
          subscriptionId: SUB_ID,
          subscriptionStatus: 'active',
          tier: 'PAID_MONTHLY',
        }),
      }),
    );
    expect(tx.userSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          subscriptionId: SUB_ID,
          paymentId: PAYMENT_ID,
          status: 'active',
        }),
      }),
    );

    expect(tx.affiliateReferral.update).not.toHaveBeenCalled();
    expect(tx.affiliate.update).not.toHaveBeenCalled();

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userSubscription.create).not.toHaveBeenCalled();

    expect(mail.sendMail).toHaveBeenCalled();

    expect(result).toEqual(
      expect.objectContaining({ success: true, tier: 'PAID_MONTHLY' }),
    );

    logErr.mockRestore();
  });

  it('idempotent replay: already-completed payment returns early without calling $transaction or email', async () => {
    const { prisma } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(completedPayment);
    const mail = makeMailMock();

    const svc = new PaymentsService(prisma as any, mail as any);

    const result = await svc.processSubscriptionPayment(PAYMENT_ID);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        alreadyCompleted: true,
        tier: 'PAID_MONTHLY',
      }),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('mid-transaction failure: userSubscription.create throws → $transaction rejects, no email sent', async () => {
    const { prisma, tx } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(pendingPayment);
    prisma.subscription.findUnique.mockResolvedValue(subscriptionRow);

    const boom = new Error('DB boom mid-transaction');
    tx.userSubscription.create.mockRejectedValue(boom);

    const mail = makeMailMock();
    const svc = new PaymentsService(prisma as any, mail as any);

    await expect(svc.processSubscriptionPayment(PAYMENT_ID)).rejects.toThrow(
      'DB boom mid-transaction',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.payment.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.userSubscription.create).toHaveBeenCalledTimes(1);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('affiliate failure does NOT roll back payment: logs [AFFILIATE_COMMISSION_FAILED], email still sent', async () => {
    const { prisma, tx } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(pendingPayment);
    prisma.subscription.findUnique.mockResolvedValue(subscriptionRow);

    tx.affiliateReferral.findUnique.mockRejectedValue(new Error('affiliate lookup exploded'));

    const mail = makeMailMock();
    const svc = new PaymentsService(prisma as any, mail as any);
    const logErr = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);

    const result = await svc.processSubscriptionPayment(PAYMENT_ID);

    expect(tx.payment.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.userSubscription.create).toHaveBeenCalledTimes(1);

    expect(tx.affiliateReferral.update).not.toHaveBeenCalled();
    expect(tx.affiliate.update).not.toHaveBeenCalled();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect((prisma.$transaction.mock.results[0] as any).type).toBe('return');

    const loggedArgs = logErr.mock.calls.flat().map((a) => String(a));
    expect(loggedArgs.some((s) => s.includes('[AFFILIATE_COMMISSION_FAILED]'))).toBe(true);
    expect(loggedArgs.some((s) => s.includes(PAYMENT_ID))).toBe(true);

    expect(mail.sendMail).toHaveBeenCalled();

    expect(result).toEqual(
      expect.objectContaining({ success: true, tier: 'PAID_MONTHLY' }),
    );

    logErr.mockRestore();
  });

  it('rejects non-pending non-completed payment (e.g. cancelled) with BadRequestException', async () => {
    const { prisma } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue({ ...pendingPayment, status: 'cancelled' });
    const mail = makeMailMock();
    const svc = new PaymentsService(prisma as any, mail as any);

    await expect(svc.processSubscriptionPayment(PAYMENT_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('missing payment row throws NotFoundException', async () => {
    const { prisma } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(null);
    const mail = makeMailMock();
    const svc = new PaymentsService(prisma as any, mail as any);

    await expect(svc.processSubscriptionPayment('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('CHURNED referral resurrects to CONVERTED on re-payment, increments affiliate totals, logs [AFFILIATE_RESURRECTION]', async () => {
    const { prisma, tx } = makePrismaMock();
    prisma.payment.findUnique.mockResolvedValue(pendingPayment);
    prisma.subscription.findUnique.mockResolvedValue(subscriptionRow);

    tx.affiliateReferral.findUnique.mockResolvedValue({
      id: 'ref_churned_1',
      affiliateId: 'aff_1',
      referredUserId: USER_ID,
      paymentAmount: 49,
      commission: 14.7,
      status: 'CHURNED',
      affiliate: { id: 'aff_1', code: 'RESURRECT25A', tier: 'STANDARD' },
    });

    const mail = makeMailMock();
    const svc = new PaymentsService(prisma as any, mail as any);
    const logLog = jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);

    await svc.processSubscriptionPayment(PAYMENT_ID);

    expect(tx.affiliateReferral.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ref_churned_1' },
        data: expect.objectContaining({ status: 'CONVERTED' }),
      }),
    );
    expect(tx.affiliate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'aff_1' },
        data: expect.objectContaining({
          totalSales: { increment: 1 },
          totalEarned: { increment: expect.any(Number) },
        }),
      }),
    );

    const loggedArgs = logLog.mock.calls.flat().map((a) => String(a));
    expect(loggedArgs.some((s) => s.includes('[AFFILIATE_RESURRECTION]'))).toBe(true);
    expect(loggedArgs.some((s) => s.includes('prior=CHURNED'))).toBe(true);

    logLog.mockRestore();
  });
});
