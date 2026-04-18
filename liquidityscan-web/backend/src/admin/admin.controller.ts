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
import { UserTier } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

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
  async updateUser(@Param('id') id: string, @Body() data: { name?: string; isAdmin?: boolean; tier?: UserTier; subscriptionStatus?: string; subscriptionExpiresAt?: string }) {
    return this.adminService.updateUser(id, data);
  }

  @Put('users/:id/subscription')
  async setUserSubscription(
    @Param('id') id: string,
    @Body() data: { tier: UserTier; expiresAt?: string | null; status?: string },
  ) {
    return this.adminService.setUserSubscription(id, data);
  }

  @Post('users/:id/extend')
  async extendUserSubscription(
    @Param('id') id: string,
    @Body() data: { days: number },
  ) {
    return this.adminService.extendUserSubscription(id, Number(data.days));
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // Feature Access
  @Get('users/:id/features')
  async getUserFeatures(@Param('id') id: string) {
    return this.adminService.getUserFeatures(id);
  }

  @Post('users/:id/features')
  async grantFeature(
    @Param('id') id: string,
    @Body() data: { feature: string; expiresAt?: string | null },
    @Req() req: any,
  ) {
    return this.adminService.grantFeature(id, data.feature, data.expiresAt, req.user?.userId);
  }

  @Delete('users/:id/features/:feature')
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
  async createCategory(@Body() data: { name: string; slug: string; description?: string; icon?: string; order?: number }) {
    return this.adminService.createCategory(data);
  }

  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() data: { name?: string; slug?: string; description?: string; icon?: string; order?: number }) {
    return this.adminService.updateCategory(id, data);
  }

  @Delete('categories/:id')
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
  async confirmPayment(@Param('id') id: string) {
    return this.adminService.confirmPayment(id);
  }

  @Put('payments/:id/cancel')
  async cancelPayment(@Param('id') id: string) {
    return this.adminService.cancelPayment(id);
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
  async setLaunchPromo(@Body() data: { enabled: boolean }) {
    return this.adminService.setLaunchPromoFullAccess(Boolean(data?.enabled));
  }

  @Patch('settings/cisd-config')
  async setCisdConfig(@Body() data: { cisdPivotLeft: number; cisdPivotRight: number; cisdMinConsecutive: number }) {
    return this.adminService.setCisdConfig(data);
  }

  @Post('settings/test-smtp')
  async testSmtp(@Body() data: { to?: string }) {
    return this.adminService.testSmtp(data?.to);
  }
}
