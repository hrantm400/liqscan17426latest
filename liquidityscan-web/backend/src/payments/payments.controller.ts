import { Controller, Get, Post, Put, Param, Body, Req, UseGuards, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { Network } from '../lib/payments/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserThrottlerGuard } from '../common/throttler/user-throttler.guard';

// PR 3.3 — all routes sit behind the global JwtAuthGuard (see
// app.module.ts). UserThrottlerGuard tracks by req.user.userId so a
// legitimate polling client from a shared NAT doesn't starve peers.
@Controller('payments')
@UseGuards(UserThrottlerGuard)
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private prisma: PrismaService
  ) { }

  @Post('create')
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  async createPayment(
    @Body() data: { amount: number; currency?: string; subscriptionId?: string; metadata?: any },
    @Req() req: any,
  ) {
    return this.paymentsService.createPayment(
      req.user.userId,
      data.amount,
      data.currency || 'USD',
      data.subscriptionId,
      data.metadata,
    );
  }

  @Get('status/:id')
  @Throttle({ strict: { limit: 60, ttl: 60000 } })
  async getPaymentStatus(@Param('id') id: string, @Req() req: any) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!payment || payment.userId !== req.user.userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.paymentsService.getPaymentStatus(id);
  }

  @Post('start')
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  async startCustomPaymentSession(
    @Body() data: { network: Network },
    @Req() req: any,
  ) {
    // Always bind session to the authenticated user — never trust body user_id (IDOR).
    const userId = req.user.userId;
    try {
      return await this.paymentsService.startPayment(userId, data.network);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'Failed to start payment session');
    }
  }

  @Get('session-status')
  async getCustomSessionStatus(@Req() req: any) {
    const userId = req.user.userId;
    const now = new Date();
    const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const latestPending = await this.prisma.payment.findFirst({
      where: {
        userId,
        status: 'pending',
        createdAt: { gte: fifteenMinsAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestPending) return { status: 'not_found_or_completed' };

    return {
      status: 'pending',
      paymentId: latestPending.id,
      amount: Number(latestPending.amount),
      paymentMethod: latestPending.paymentMethod,
      expiresAt: (latestPending.metadata as any)?.expiresAt,
    };
  }

  @Put('status/:id')
  @Throttle({ strict: { limit: 20, ttl: 60000 } })
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() data: { status: string; paymentId?: string },
    @Req() req: any,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!payment || payment.userId !== req.user.userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.paymentsService.updatePaymentStatus(id, data.status, data.paymentId);
  }

  @Get('my-payments')
  async getMyPayments(@Req() req: any) {
    return this.paymentsService.getUserPayments(req.user.userId);
  }

  @Post('subscription/:subscriptionId')
  @Throttle({ strict: { limit: 20, ttl: 60000 } })
  async createSubscriptionPayment(
    @Param('subscriptionId') subscriptionId: string,
    @Req() req: any,
  ) {
    return this.paymentsService.createSubscriptionPayment(req.user.userId, subscriptionId);
  }

  @Post('process-subscription/:paymentId')
  @Throttle({ strict: { limit: 20, ttl: 60000 } })
  async processSubscriptionPayment(@Param('paymentId') paymentId: string, @Req() req: any) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { userId: true },
    });
    if (!payment || payment.userId !== req.user.userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.paymentsService.processSubscriptionPayment(paymentId);
  }
}
