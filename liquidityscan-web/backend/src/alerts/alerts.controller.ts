import { Controller, Get, Post, Put, Delete, Body, Param, Req } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
    constructor(private readonly alertsService: AlertsService) { }

    @Get()
    async getMyAlerts(@Req() req) {
        return this.alertsService.getUserAlerts(req.user.userId);
    }

    /** Strategy list + allowed timeframes per scanner (matches market scan). */
    @Get('strategy-options')
    getStrategyOptions() {
        return this.alertsService.getStrategyOptions();
    }

    @Post()
    async createAlert(
        @Req() req,
        @Body() body: {
            symbol: string;
            strategyType: string;
            timeframes?: string[];
            directions?: string[];
        },
    ) {
        return this.alertsService.createAlert(
            req.user.userId,
            body.symbol,
            body.strategyType,
            body.timeframes,
            body.directions,
        );
    }

    @Put(':id')
    async updateAlert(
        @Req() req,
        @Param('id') id: string,
        @Body() body: {
            timeframes?: string[];
            directions?: string[];
            isActive?: boolean;
        },
    ) {
        return this.alertsService.updateAlert(req.user.userId, id, body);
    }

    /** Two path segments so this never collides with @Delete(':id') (single segment). */
    @Delete('telegram/unlink')
    async unlinkTelegram(@Req() req) {
        return this.alertsService.clearTelegramId(req.user.userId);
    }

    /** Legacy; some proxies/orderings sent DELETE here into :id — keep + guard below. */
    @Delete('telegram-id')
    async disconnectTelegram(@Req() req) {
        return this.alertsService.clearTelegramId(req.user.userId);
    }

    @Delete(':id')
    async deleteAlert(@Req() req, @Param('id') id: string) {
        // Any mistaken DELETE into :id (wrong route order, bad proxy path) should unlink, not 404 subscription.
        if (id === 'telegram-id' || id === 'unlink' || id === 'telegram-unlink') {
            return this.alertsService.clearTelegramId(req.user.userId);
        }
        return this.alertsService.deleteAlert(req.user.userId, id);
    }

    @Post('telegram-link')
    async createTelegramLink(@Req() req) {
        return this.alertsService.createTelegramDeepLink(req.user.userId);
    }

    /** Unlink via POST so proxies/WAF never collapse path into DELETE /alerts/:id. */
    @Post('telegram-unlink')
    async unlinkTelegramPost(@Req() req) {
        return this.alertsService.clearTelegramId(req.user.userId);
    }

    @Post('telegram-id')
    async saveTelegramId(@Req() req, @Body() body: { telegramId: string }) {
        return this.alertsService.saveTelegramId(req.user.userId, body.telegramId);
    }

    @Get('telegram-id')
    async getTelegramId(@Req() req) {
        return this.alertsService.getTelegramId(req.user.userId);
    }
}
