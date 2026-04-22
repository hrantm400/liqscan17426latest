import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserTier } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';
import { UserThrottlerGuard } from '../common/throttler/user-throttler.guard';
import { CoreLayerAdminService } from '../core-layer/core-layer.admin.service';
import { SetCoreLayerEnabledDto } from '../core-layer/dto/set-core-layer-enabled.dto';

// PR 3.3 — admin mutations are user-tracked (not IP-tracked) so one
// admin accidentally hammering the refund endpoint from home WiFi
// doesn't lock another admin out of the same NAT. `strict` is 10/60s
// by default in app.module; per-route @Throttle overrides below.
@Controller('admin')
@UseGuards(AdminGuard, UserThrottlerGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private coreLayerAdmin: CoreLayerAdminService,
  ) {}

  // Analytics
  @Get('analytics')
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboard();
  }

  // Users
  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('grants') grants?: string,
  ) {
    const grantsFilter =
      grants === 'active' || grants === 'none' ? grants : undefined;
    return this.adminService.getUsers({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      grants: grantsFilter,
    });
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async updateUser(@Param('id') id: string, @Body() data: { name?: string; isAdmin?: boolean; tier?: UserTier; subscriptionStatus?: string; subscriptionExpiresAt?: string }) {
    return this.adminService.updateUser(id, data);
  }

  @Put('users/:id/subscription')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async setUserSubscription(
    @Param('id') id: string,
    @Body() data: { tier: UserTier; expiresAt?: string | null; status?: string },
  ) {
    return this.adminService.setUserSubscription(id, data);
  }

  @Post('users/:id/extend')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async extendUserSubscription(
    @Param('id') id: string,
    @Body() data: { days: number },
  ) {
    return this.adminService.extendUserSubscription(id, Number(data.days));
  }

  @Delete('users/:id')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // Feature Access
  @Get('users/:id/features')
  async getUserFeatures(@Param('id') id: string) {
    return this.adminService.getUserFeatures(id);
  }

  @Post('users/:id/features')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async grantFeature(
    @Param('id') id: string,
    @Body() data: { feature: string; expiresAt?: string | null },
    @Req() req: any,
  ) {
    return this.adminService.grantFeature(id, data.feature, data.expiresAt, req.user?.userId);
  }

  @Delete('users/:id/features/:feature')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async revokeFeature(
    @Param('id') id: string,
    @Param('feature') feature: string,
  ) {
    return this.adminService.revokeFeature(id, feature);
  }

  // Categories
  @Get('categories')
  async getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async createCategory(@Body() data: { name: string; slug: string; description?: string; icon?: string; order?: number }) {
    return this.adminService.createCategory(data);
  }

  @Put('categories/:id')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async updateCategory(@Param('id') id: string, @Body() data: { name?: string; slug?: string; description?: string; icon?: string; order?: number }) {
    return this.adminService.updateCategory(id, data);
  }

  @Delete('categories/:id')
  @Throttle({ strict: { limit: 30, ttl: 60000 } })
  async deleteCategory(@Param('id') id: string) {
    return this.adminService.deleteCategory(id);
  }


  // Payments
  @Get('payments')
  async getPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('network') network?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.adminService.getPayments({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      status,
      userId,
      network,
      search,
      dateFrom,
      dateTo,
    });
  }

  @Put('payments/:id/confirm')
  @Throttle({ strict: { limit: 20, ttl: 60000 } })
  async confirmPayment(@Param('id') id: string) {
    return this.adminService.confirmPayment(id);
  }

  @Put('payments/:id/cancel')
  @Throttle({ strict: { limit: 20, ttl: 60000 } })
  async cancelPayment(@Param('id') id: string) {
    return this.adminService.cancelPendingPayment(id);
  }

  @Put('payments/:id/refund')
  @Throttle({ strict: { limit: 20, ttl: 60000 } })
  async refundPayment(@Param('id') id: string) {
    return this.adminService.refundCompletedPayment(id);
  }

  @Get('email-logs')
  async getEmailLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.adminService.getEmailLogs({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      status,
      search,
      dateFrom,
      dateTo,
    });
  }

  @Post('broadcast')
  // PR 3.3 — mass-email / mass-telegram blast. 5 per 5 minutes gives
  // room for the iterate-fix-typo-resend workflow while still blocking
  // abuse. Adjust if an admin hits the wall during normal composition.
  @Throttle({ burst: { limit: 5, ttl: 300000 } })
  async broadcast(
    @Body() data: { subject: string; body: string; channel: 'email' | 'telegram' | 'both'; filter: 'all' | 'free' | 'paid' },
  ) {
    return this.adminService.broadcast(data);
  }

  @Get('settings')
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings/launch-promo')
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  async setLaunchPromo(@Body() data: { enabled: boolean }) {
    return this.adminService.setLaunchPromoFullAccess(Boolean(data?.enabled));
  }

  @Patch('settings/cisd-config')
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  async setCisdConfig(@Body() data: { cisdPivotLeft: number; cisdPivotRight: number; cisdMinConsecutive: number }) {
    return this.adminService.setCisdConfig(data);
  }

  @Post('settings/test-smtp')
  // PR 3.3 — SMTP-send abuse guard. 5/5min matches broadcast window.
  @Throttle({ burst: { limit: 5, ttl: 300000 } })
  async testSmtp(@Body() data: { to?: string }) {
    return this.adminService.testSmtp(data?.to);
  }

  // -------- Core-Layer admin controls (Phase 5b) ----------------------
  // Three endpoints covering the full control surface exposed on the
  // /admin/settings page. Throttling is per-admin via UserThrottlerGuard
  // + the `strict` named throttler (10/60s default). Stats is the only
  // read and gets a wider 60/60s window because the admin UI polls it
  // on a 10-second interval when the card is open.

  @Get('core-layer/stats')
  @Throttle({ strict: { limit: 60, ttl: 60000 } })
  async getCoreLayerStats() {
    return this.coreLayerAdmin.getStats();
  }

  @Post('core-layer/enabled')
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  async setCoreLayerEnabled(
    @Body() body: SetCoreLayerEnabledDto,
    @Req() req: any,
  ) {
    return this.coreLayerAdmin.setEnabled(Boolean(body?.enabled), req.user?.userId);
  }

  @Post('core-layer/force-rescan')
  // Force-rescan kicks off a synchronous detection pass. Keep the
  // limit tight: one rescan clears ACTIVE rows and rebuilds from live
  // upstream signals, and hammering it would just re-run work. 3/60s
  // is enough for "toggle, wait, retry" without being accidentally
  // destructive.
  @Throttle({ strict: { limit: 3, ttl: 60000 } })
  async forceCoreLayerRescan() {
    return this.coreLayerAdmin.forceRescan();
  }
}
