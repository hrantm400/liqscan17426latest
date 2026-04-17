import { Controller, Get, Put, Post, Body, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { AlertsService } from '../alerts/alerts.service';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private alertsService: AlertsService,
  ) {}

  @Get('me')
  async getProfile(@Req() req: any) {
    return this.usersService.findById(req.user.userId);
  }

  @Put('me')
  async updateProfile(@Req() req: any, @Body() data: { name?: string; avatar?: string; timezone?: string }) {
    return this.usersService.updateProfile(req.user.userId, data);
  }

  /** Telegram account link state (avoids /alerts/* subpaths that some proxies mishandle). */
  @Get('me/telegram')
  async getTelegramId(@Req() req: any) {
    return this.alertsService.getTelegramId(req.user.userId);
  }

  @Post('me/telegram')
  async saveTelegramId(@Req() req: any, @Body() body: { telegramId: string }) {
    return this.alertsService.saveTelegramId(req.user.userId, body.telegramId);
  }

  @Post('me/telegram/link')
  async createTelegramDeepLink(@Req() req: any) {
    return this.alertsService.createTelegramDeepLink(req.user.userId);
  }

  @Post('me/telegram/unlink')
  async unlinkTelegram(@Req() req: any) {
    return this.alertsService.clearTelegramId(req.user.userId);
  }

  /** Same payload as GET /alerts/strategy-options — under /users/me for proxies that break /alerts/*. */
  @Get('me/alert-strategy-options')
  getAlertStrategyOptions() {
    return this.alertsService.getStrategyOptions();
  }
}
