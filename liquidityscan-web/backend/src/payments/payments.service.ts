import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) { }

  async createPayment(
    userId: string,
    baseAmount: number,
    currency: string = 'USDT',
    subscriptionId?: string,
    metadata?: any,
    paymentMethod: 'crypto_trc20' | 'crypto_bep20' = 'crypto_trc20',
  ) {
    // Determine unique fractional amount
    const tenMinutesAgo = new Date();
    tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 15); // Check last 15 mins to be safe

    const recentPendingPayments = await this.prisma.payment.findMany({
      where: {
        status: 'pending',
        createdAt: { gte: tenMinutesAgo },
        paymentMethod,
      },
    });

    let uniqueAmount = baseAmount;
    let increment = 0;
    const maxIncrement = 99; // Allows up to .99

    while (increment <= maxIncrement) {
      const testAmount = parseFloat((baseAmount + increment / 100).toFixed(2));
      const isTaken = recentPendingPayments.some(p => parseFloat(p.amount.toString()) === testAmount);

      if (!isTaken) {
        uniqueAmount = testAmount;
        break;
      }
      increment++;
    }

    if (increment > maxIncrement) {
      throw new BadRequestException('Too many concurrent checkout sessions. Please try again in a few minutes.');
    }

    const timeoutMinutes = Number(process.env.PAYMENT_TIMEOUT_MINUTES || 10);
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
      throw new BadRequestException('PAYMENT_TIMEOUT_MINUTES is invalid');
    }

    // Set expiration from env
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + timeoutMinutes);

    const walletAddress =
      paymentMethod === 'crypto_bep20'
        ? process.env.WALLET_BEP20
        : (process.env.TRC20_WALLET_ADDRESS || process.env.WALLET_TRC20);

    if (!walletAddress) {
      throw new BadRequestException(
        paymentMethod === 'crypto_bep20'
          ? 'WALLET_BEP20 is not configured'
          : 'TRC20 wallet address is not configured (TRC20_WALLET_ADDRESS or WALLET_TRC20)',
      );
    }

    const paymentInfoMeta = {
      ...(metadata || {}),
      walletAddress,
      expiresAt: expiresAt.toISOString(),
    };

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: uniqueAmount,
        currency,
        status: 'pending',
        paymentMethod,
        subscriptionId: subscriptionId || null,
        metadata: paymentInfoMeta,
      },
    });

    // Provide the frontend with the required info
    return {
      ...payment,
      paymentId: payment.id, // We use our own DB ID now
      paymentUrl: '', // No external URL anymore
    };
  }

  async startPayment(userId: string, network: 'TRC20' | 'BEP20') {
    const paymentMethod = network === 'BEP20' ? 'crypto_bep20' : 'crypto_trc20';

    // Pick subscription: FULL_ACCESS
    const subscription = await this.prisma.subscription.findFirst({
      where: { tier: 'FULL_ACCESS' },
      orderBy: { createdAt: 'asc' },
    });

    if (!subscription) {
      throw new NotFoundException('FULL_ACCESS subscription not found');
    }

    const baseMonthly = Number(process.env.BASE_PRICE || 49);
    const firstMonthPrice = Number(process.env.FIRST_MONTH_PRICE || 24.5);

    if (!Number.isFinite(baseMonthly) || baseMonthly <= 0) {
      throw new BadRequestException('BASE_PRICE is invalid');
    }
    if (!Number.isFinite(firstMonthPrice) || firstMonthPrice <= 0) {
      throw new BadRequestException('FIRST_MONTH_PRICE is invalid');
    }

    let basePrice: number;
    let isFirstMonth = false;

    // first month is only applicable if user has never completed a payment for FULL_ACCESS
    const hadPriorCompleted = await this.prisma.payment.findFirst({
      where: {
        userId,
        status: 'completed',
        subscriptionId: subscription.id,
      },
      select: { id: true },
    });

    if (hadPriorCompleted) {
      basePrice = baseMonthly;
    } else {
      basePrice = firstMonthPrice;
      isFirstMonth = true;
    }

    const payment = await this.createPayment(
      userId,
      basePrice,
      'USDT',
      subscription.id,
      {
        plan: 'monthly',
        network,
        planType: isFirstMonth ? 'first_month' : 'full',
        isFirstMonth,
        basePrice,
      },
      paymentMethod,
    );

    const meta = (payment.metadata as any) || {};
    return {
      paymentId: payment.id,
      amount: Number(payment.amount),
      walletAddress: meta.walletAddress,
      expiresAt: meta.expiresAt,
      isFirstMonth,
      basePrice,
      currency: payment.currency,
      network,
    };
  }

  async createSubscriptionPayment(userId: string, subscriptionId: string, plan: 'monthly' | 'annual' = 'monthly') {
    // Get subscription details
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${subscriptionId} not found`);
    }

    const amount = plan === 'annual' && subscription.priceYearly
      ? parseFloat(subscription.priceYearly.toString())
      : parseFloat(subscription.priceMonthly.toString());

    // Create payment for subscription
    return this.createPayment(userId, amount, 'USDT', subscriptionId, { plan });
  }

  async processSubscriptionPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== 'pending') {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }

    if (!payment.subscriptionId) {
      throw new BadRequestException('This payment is not for a subscription');
    }

    // Get subscription
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: payment.subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Determine plan type from payment metadata or amount
    const meta = (payment.metadata as any) || {};
    const payAmount = Number(payment.amount);

    // Check if it's an annual plan from metadata or price
    const isAnnual = meta.plan === 'annual' || payAmount >= 400;

    // Use subscription duration if available, otherwise fallback
    let durationDays = subscription.duration || 30;
    if (isAnnual && subscription.priceYearly) {
      durationDays = 365;
    }

    const tier = isAnnual ? 'PAID_ANNUAL' : 'PAID_MONTHLY';

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    // Update payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'completed' },
    });

    // Assign subscription + upgrade tier
    await this.prisma.user.update({
      where: { id: payment.userId },
      data: {
        subscriptionId: subscription.id,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: expiresAt,
        tier,
      },
    });

    // Create UserSubscription record
    await this.prisma.userSubscription.create({
      data: {
        userId: payment.userId,
        subscriptionId: subscription.id,
        startDate: new Date(),
        endDate: expiresAt,
        status: 'active',
        paymentId: paymentId,
      },
    });

    // Credit affiliate commission if user was referred
    try {
      const referral = await this.prisma.affiliateReferral.findUnique({
        where: { referredUserId: payment.userId },
        include: { affiliate: true },
      });
      if (referral && referral.affiliate) {
        const RATES: Record<string, number> = { STANDARD: 0.30, ELITE: 0.40, AGENCY: 0.20 };
        const rate = RATES[referral.affiliate.tier] || 0.30;
        const commission = payAmount * rate;
        await this.prisma.affiliateReferral.update({
          where: { id: referral.id },
          data: { paymentAmount: payAmount, commission, status: 'CONVERTED' },
        });
        await this.prisma.affiliate.update({
          where: { id: referral.affiliateId },
          data: { totalSales: { increment: 1 }, totalEarned: { increment: commission } },
        });
        this.logger.log(`Affiliate commission: $${commission.toFixed(2)} to ${referral.affiliate.code}`);
      }
    } catch (e) {
      this.logger.error(`Affiliate commission error: ${e}`);
    }

    this.logger.log(`User ${payment.userId} upgraded to ${tier}, expires ${expiresAt.toISOString()}`);

    // Notify user + admins about successful payment (best-effort, non-blocking for payment flow)
    await this.sendPaymentNotificationEmails({
      userEmail: payment.user?.email || null,
      amount: payAmount,
      network: String((meta?.network || payment.paymentMethod || '')).toUpperCase(),
      tier,
      expiresAt,
    });

    return {
      success: true,
      subscription,
      tier,
      expiresAt,
    };
  }

  async getPaymentStatus(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async updatePaymentStatus(paymentId: string, status: string, paymentIdExternal?: string) {
    const data: { status: string; paymentId?: string } = { status };
    if (paymentIdExternal !== undefined && paymentIdExternal !== null) {
      data.paymentId = paymentIdExternal;
    }
    const payment = await this.prisma.payment.update({
      where: { id: paymentId },
      data,
    });
    return payment;
  }

  async getUserPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async sendPaymentNotificationEmails(args: {
    userEmail: string | null;
    amount: number;
    network: string;
    tier: string;
    expiresAt: Date;
  }) {
    const dashboardUrl = process.env.FRONTEND_URL || 'https://liquidityscan.io';
    const expiresText = args.expiresAt.toLocaleDateString('en-US');
    const amountText = args.amount.toFixed(2);

    if (args.userEmail) {
      try {
        await this.mailService.sendMail({
          to: args.userEmail,
          subject: 'Payment Confirmed -- Full Access Activated',
          html: `
            <p>Hello,</p>
            <p>Your payment has been confirmed successfully.</p>
            <ul>
              <li><strong>Amount:</strong> $${amountText} USDT</li>
              <li><strong>Network:</strong> ${args.network || 'N/A'}</li>
              <li><strong>Tier:</strong> ${args.tier}</li>
              <li><strong>Expires:</strong> ${expiresText}</li>
            </ul>
            <p>You now have Full Access to all signals and alerts.</p>
            <p><a href="${dashboardUrl}/dashboard">Open Dashboard</a></p>
          `,
        });
      } catch (e) {
        this.logger.error(`Failed to send payment confirmation email to user: ${args.userEmail}`, e as any);
      }
    }

    const adminEmails = String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    if (adminEmails.length === 0) return;

    await Promise.all(adminEmails.map(async (adminEmail) => {
      try {
        await this.mailService.sendMail({
          to: adminEmail,
          subject: `New Payment: $${amountText} from ${args.userEmail || 'unknown user'}`,
          html: `
            <p>A new payment was confirmed.</p>
            <ul>
              <li><strong>User:</strong> ${args.userEmail || 'N/A'}</li>
              <li><strong>Amount:</strong> $${amountText} USDT</li>
              <li><strong>Network:</strong> ${args.network || 'N/A'}</li>
              <li><strong>Tier Granted:</strong> ${args.tier}</li>
              <li><strong>Expires:</strong> ${expiresText}</li>
            </ul>
          `,
        });
      } catch (e) {
        this.logger.error(`Failed to send admin payment email: ${adminEmail}`, e as any);
      }
    }));
  }
}
