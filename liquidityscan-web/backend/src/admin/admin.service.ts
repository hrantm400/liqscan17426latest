import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma, UserTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { MailService } from '../mail/mail.service';
import { TelegramService } from '../telegram/telegram.service';
import { AppConfigService } from '../app-config/app-config.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private paymentsService: PaymentsService,
    private mailService: MailService,
    private telegramService: TelegramService,
    private appConfig: AppConfigService,
  ) {}

  // Users Management
  async getUsers(filters: {
    page?: number;
    limit?: number;
    search?: string;
    grants?: 'active' | 'none';
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const now = new Date();
    const activeGrantWhere = {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    const andConditions: object[] = [];

    if (filters.search) {
      andConditions.push({
        OR: [
          { email: { contains: filters.search, mode: 'insensitive' } },
          { name: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    if (filters.grants === 'active') {
      andConditions.push({ featureAccess: { some: activeGrantWhere } });
    } else if (filters.grants === 'none') {
      andConditions.push({
        NOT: {
          featureAccess: {
            some: activeGrantWhere,
          },
        },
      });
    }

    const where: any =
      andConditions.length === 0
        ? {}
        : andConditions.length === 1
          ? andConditions[0]
          : { AND: andConditions };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          isAdmin: true,
          tier: true,
          subscriptionStatus: true,
          subscriptionId: true,
          subscriptionExpiresAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              payments: true,
              featureAccess: {
                where: activeGrantWhere,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = users.map(({ _count, ...rest }) => ({
      ...rest,
      activeFeatureGrantCount: _count.featureAccess,
      _count: { payments: _count.payments },
    }));

    return {
      data,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        subscription: true,
        alertSubscriptions: {
          orderBy: { createdAt: 'desc' },
        },
        userSubscriptions: {
          include: { subscription: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateUser(id: string, data: { name?: string; isAdmin?: boolean; tier?: UserTier; subscriptionStatus?: string; subscriptionExpiresAt?: string }) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.isAdmin !== undefined) updateData.isAdmin = data.isAdmin;

    // Admin can grant/revoke Full Access by setting tier
    if (data.tier !== undefined) {
      const validTiers = ['FREE', 'PAID_MONTHLY', 'PAID_ANNUAL'];
      if (validTiers.includes(data.tier)) {
        updateData.tier = data.tier;
        if (data.tier === 'FREE') {
          updateData.subscriptionStatus = 'expired';
          updateData.subscriptionExpiresAt = null;
        } else {
          updateData.subscriptionStatus = 'active';
          // Grant 365 days for admin-granted access
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 365);
          updateData.subscriptionExpiresAt = expiresAt;
        }
      }
    }
    if (data.subscriptionStatus !== undefined) updateData.subscriptionStatus = data.subscriptionStatus;
    if (data.subscriptionExpiresAt !== undefined) updateData.subscriptionExpiresAt = data.subscriptionExpiresAt ? new Date(data.subscriptionExpiresAt) : null;

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        isAdmin: true,
        tier: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteUser(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  // Feature Access Management
  async getUserFeatures(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const grants = await this.prisma.featureAccess.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const granterIds = [...new Set(grants.map((g) => g.grantedBy).filter((id): id is string => Boolean(id)))];
    const granters =
      granterIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: granterIds } },
            select: { id: true, email: true, name: true },
          })
        : [];
    const granterById = new Map(granters.map((u) => [u.id, u]));
    return grants.map((g) => ({
      ...g,
      grantedByUser: g.grantedBy ? granterById.get(g.grantedBy) ?? null : null,
    }));
  }

  async grantFeature(userId: string, feature: string, expiresAt?: string | null, grantedBy?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const validFeatures = ['super_engulfing', 'ict_bias', 'rsi_divergence', 'crt', 'telegram_alerts', 'academy', 'tools', 'watchlist', 'all'];
    if (!validFeatures.includes(feature)) {
      throw new BadRequestException(`Invalid feature: ${feature}. Valid: ${validFeatures.join(', ')}`);
    }

    return this.prisma.featureAccess.upsert({
      where: { userId_feature: { userId, feature } },
      update: {
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        grantedBy: grantedBy || null,
      },
      create: {
        userId,
        feature,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        grantedBy: grantedBy || null,
      },
    });
  }

  async revokeFeature(userId: string, feature: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    try {
      await this.prisma.featureAccess.delete({
        where: { userId_feature: { userId, feature } },
      });
    } catch {
      // Already deleted — ignore
    }
    return { success: true };
  }

  // Categories Management
  async getCategories() {
    return this.prisma.category.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async createCategory(data: { name: string; slug: string; description?: string; icon?: string; order?: number }) {
    return this.prisma.category.create({
      data,
    });
  }

  async updateCategory(id: string, data: { name?: string; slug?: string; description?: string; icon?: string; order?: number }) {
    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  async deleteCategory(id: string) {
    return this.prisma.category.delete({
      where: { id },
    });
  }


  // Analytics
  async getAnalytics() {
    const [
      totalUsers,
      totalPayments,
      revenue,
      recentUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.payment.count({ where: { status: 'completed' } }),
      this.prisma.payment.aggregate({
        where: { status: 'completed' },
        _sum: { amount: true },
      }),
      this.prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      stats: {
        totalUsers,
        totalPayments,
        revenue: revenue._sum.amount || 0,
      },
      recentUsers,
    };
  }

  async getDashboard() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, freeUsers, activeSubscribers, monthlyNewUsers, churnedThisMonth, revenueAgg, recentPayments, recentUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { tier: 'FREE' } }),
      this.prisma.user.count({ where: { tier: { not: 'FREE' }, subscriptionStatus: 'active' } }),
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.user.count({ where: { subscriptionStatus: 'expired', updatedAt: { gte: monthStart } } }),
      this.prisma.payment.aggregate({ where: { status: 'completed' }, _sum: { amount: true } }),
      this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, email: true, name: true, createdAt: true, tier: true },
      }),
    ]);

    const monthlyRevenueRows = await this.prisma.$queryRaw<Array<{ month: string; revenue: number; subscribers: number }>>`
      SELECT
        to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
        COALESCE(SUM("amount")::float, 0)                   AS revenue,
        COUNT(*)::int                                        AS subscribers
      FROM payments
      WHERE status = 'completed'
        AND "createdAt" >= date_trunc('month', now()) - interval '11 months'
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return {
      stats: {
        totalUsers,
        freeUsers,
        activeSubscribers,
        newUsersThisMonth: monthlyNewUsers,
        churnThisMonth: churnedThisMonth,
        totalRevenue: Number(revenueAgg._sum.amount || 0),
        mrr: activeSubscribers * Number(process.env.BASE_PRICE || 49),
      },
      monthlyRevenue: monthlyRevenueRows,
      recentPayments,
      recentUsers,
    };
  }

  // Payments
  async getPayments(filters: {
    page?: number;
    limit?: number;
    status?: string;
    userId?: string;
    network?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.network) {
      where.paymentMethod = filters.network;
    }
    if (filters.search) {
      where.user = {
        OR: [
          { email: { contains: filters.search, mode: 'insensitive' } },
          { name: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  async confirmPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'completed') return { success: true, alreadyCompleted: true };
    if (payment.status !== 'pending') throw new BadRequestException(`Only pending payments can be confirmed (current: ${payment.status})`);
    return this.paymentsService.processSubscriptionPayment(paymentId);
  }

  async cancelPendingPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'completed') {
      throw new BadRequestException(
        'Completed payment cannot be cancelled — use refund endpoint instead',
      );
    }
    if (payment.status === 'cancelled') {
      return { success: true, alreadyCancelled: true };
    }
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'cancelled' },
    });
    return { success: true };
  }

  async refundCompletedPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'refunded') {
      return { success: true, alreadyRefunded: true };
    }
    if (payment.status !== 'completed') {
      throw new BadRequestException(
        `Only completed payments can be refunded (current: ${payment.status})`,
      );
    }

    const now = new Date();

    await this.prisma.$transaction(
      async (tx) => {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'refunded' },
        });

        await tx.user.update({
          where: { id: payment.userId },
          data: {
            tier: 'FREE',
            subscriptionStatus: 'cancelled',
            subscriptionExpiresAt: now,
            subscriptionId: null,
          },
        });

        const userSub = await tx.userSubscription.findFirst({
          where: { paymentId, status: 'active' },
        });
        if (userSub) {
          await tx.userSubscription.update({
            where: { id: userSub.id },
            data: { status: 'cancelled', endDate: now },
          });
        }

        try {
          const referral = await tx.affiliateReferral.findUnique({
            where: { referredUserId: payment.userId },
            include: { affiliate: true },
          });
          if (referral?.status === 'CONVERTED' && referral.affiliate) {
            const commission = referral.commission || 0;
            const affiliate = referral.affiliate;

            const clampedTotalSales = Math.max(0, affiliate.totalSales - 1);
            const clampedTotalEarned = Math.max(0, (affiliate.totalEarned || 0) - commission);

            if (affiliate.totalSales === 0 || (affiliate.totalEarned || 0) < commission) {
              this.logger.warn(
                `[AFFILIATE_REVERSAL_UNDERFLOW] affiliateId=${affiliate.id} ` +
                  `paymentId=${paymentId}: expected to decrement below 0, clamped to 0. ` +
                  `Indicates a prior commission bookkeeping bug.`,
              );
            }

            await tx.affiliate.update({
              where: { id: affiliate.id },
              data: { totalSales: clampedTotalSales, totalEarned: clampedTotalEarned },
            });
            await tx.affiliateReferral.update({
              where: { id: referral.id },
              // CHURNED is shared state: reached by (a) natural churn on subscription
              // expiry, (b) refund-triggered reversal. To distinguish, check the
              // associated payment.status='refunded' or grep logs for
              // [AFFILIATE_REVERSAL]. A future PR may add a dedicated reversedAt
              // column (see TD-8 in PHASE3_TECH_DEBT.md).
              data: { status: 'CHURNED' },
            });
            this.logger.log(
              `[AFFILIATE_REVERSAL] commission -$${commission.toFixed(2)} from ${affiliate.code} ` +
                `(paymentId=${paymentId}, referralId=${referral.id})`,
            );
          }
        } catch (affiliateError) {
          const msg =
            affiliateError instanceof Error ? affiliateError.message : String(affiliateError);
          this.logger.error(
            `[AFFILIATE_REVERSAL_FAILED] paymentId=${paymentId} userId=${payment.userId}: ${msg}`,
            affiliateError instanceof Error ? affiliateError.stack : undefined,
          );
        }
      },
      {
        maxWait: 5000,
        timeout: 15000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );

    this.logger.log(
      `Payment refunded: ${paymentId} user=${payment.userId} amount=$${payment.amount}`,
    );

    return { success: true };
  }

  async setUserSubscription(id: string, data: { tier: UserTier; expiresAt?: string | null; status?: string }) {
    const validTiers = ['FREE', 'PAID_MONTHLY', 'PAID_ANNUAL'];
    if (!validTiers.includes(data.tier)) {
      throw new BadRequestException(`Invalid tier: ${data.tier}`);
    }
    const defaultPaidExpiry = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d;
    })();

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        tier: data.tier,
        subscriptionStatus: data.status ?? (data.tier === 'FREE' ? 'expired' : 'active'),
        subscriptionExpiresAt: data.expiresAt
          ? new Date(data.expiresAt)
          : (data.tier === 'FREE' ? null : defaultPaidExpiry),
      },
    });
    return updated;
  }

  async extendUserSubscription(id: string, days: number) {
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException('days must be a positive number');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const base = user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date() ? user.subscriptionExpiresAt : new Date();
    const expiresAt = new Date(base);
    expiresAt.setDate(expiresAt.getDate() + Math.floor(days));

    return this.prisma.user.update({
      where: { id },
      data: {
        subscriptionExpiresAt: expiresAt,
        subscriptionStatus: 'active',
        tier: user.tier === 'FREE' ? 'PAID_MONTHLY' : user.tier,
      },
    });
  }

  async getEmailLogs(filters: { page?: number; limit?: number; status?: string; search?: string; dateFrom?: string; dateTo?: string }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { to: { contains: filters.search, mode: 'insensitive' } },
        { subject: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.dateFrom || filters.dateTo) {
      where.sentAt = {};
      if (filters.dateFrom) where.sentAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.sentAt.lte = new Date(filters.dateTo);
    }

    const [rows, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.emailLog.count({ where }),
    ]);
    return { data: rows, total, page, pageCount: Math.ceil(total / limit) };
  }

  async broadcast(args: {
    subject: string;
    body: string;
    channel: 'email' | 'telegram' | 'both';
    filter: 'all' | 'free' | 'paid';
  }) {
    const where: Prisma.UserWhereInput =
      args.filter === 'free'
        ? { tier: 'FREE' }
        : args.filter === 'paid'
          ? { tier: { not: 'FREE' } }
          : {};
    const users = await this.prisma.user.findMany({
      where,
      select: { email: true, telegramId: true },
    });

    let emailSent = 0;
    let telegramSent = 0;

    if (args.channel === 'email' || args.channel === 'both') {
      for (const user of users) {
        if (!user.email) continue;
        try {
          await this.mailService.sendMail({
            to: user.email,
            subject: args.subject,
            html: `<p>${args.body.replace(/\n/g, '<br/>')}</p>`,
          });
          emailSent++;
        } catch {
          // logged by MailService
        }
      }
    }

    if (args.channel === 'telegram' || args.channel === 'both') {
      for (const user of users) {
        if (!user.telegramId) continue;
        try {
          await this.telegramService.sendDirectMessage(user.telegramId, `*${args.subject}*\n\n${args.body}`, 'Markdown');
          telegramSent++;
        } catch {
          // ignore individual failures
        }
      }
    }

    return { success: true, total: users.length, emailSent, telegramSent };
  }

  async getSettings() {
    const config = await this.appConfig.getConfig();
    return {
      launchPromoFullAccess: config.launchPromoFullAccess,
      cisdPivotLeft: config.cisdPivotLeft,
      cisdPivotRight: config.cisdPivotRight,
      cisdMinConsecutive: config.cisdMinConsecutive,
      pricing: {
        basePrice: Number(process.env.BASE_PRICE || 49),
        firstMonthPrice: Number(process.env.FIRST_MONTH_PRICE || 24.5),
        paymentTimeoutMinutes: Number(process.env.PAYMENT_TIMEOUT_MINUTES || 10),
      },
      wallets: {
        trc20: process.env.TRC20_WALLET_ADDRESS || process.env.WALLET_TRC20 || null,
        bep20: process.env.WALLET_BEP20 || null,
      },
      smtp: {
        host: process.env.SMTP_HOST || null,
        port: Number(process.env.SMTP_PORT || 465),
        user: process.env.SMTP_USER || null,
        configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      },
    };
  }

  async setLaunchPromoFullAccess(enabled: boolean) {
    await this.appConfig.setLaunchPromoFullAccess(enabled);
    return { launchPromoFullAccess: enabled };
  }

  async setCisdConfig(data: { cisdPivotLeft: number; cisdPivotRight: number; cisdMinConsecutive: number }) {
    await this.appConfig.setCisdConfig(data);
    return data;
  }

  async testSmtp(to?: string) {
    const target = to || process.env.SMTP_USER;
    if (!target) throw new BadRequestException('No target email provided');
    await this.mailService.sendMail({
      to: target,
      subject: 'SMTP test from LiquidityScan admin',
      html: '<p>SMTP is configured correctly.</p>',
    });
    return { success: true, to: target };
  }
}
