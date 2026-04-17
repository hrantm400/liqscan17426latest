import { Controller, Get, Post, Put, Param, Body, Req, Headers, BadRequestException, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Network } from '../lib/payments/types';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private prisma: PrismaService
  ) { }

  @Post('nowpayments-webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async nowPaymentsWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-nowpayments-sig') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing x-nowpayments-sig');
    }
    try {
      await this.paymentsService.handleNowPaymentsWebhook(body, signature);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Webhook processing failed');
    }
  }

  @Post('create')
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
  async createSubscriptionPayment(
    @Param('subscriptionId') subscriptionId: string,
    @Req() req: any,
  ) {
    return this.paymentsService.createSubscriptionPayment(req.user.userId, subscriptionId);
  }

  @Post('process-subscription/:paymentId')
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
