import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import {
    getStrategyAlertOptionsForApi,
    getStrategyDefinition,
    normalizeSubscriptionTimeframes,
} from './strategy-alert-config';

const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class AlertsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly pricingService: PricingService,
    ) { }

    async getUserAlerts(userId: string) {
        return this.prisma.alertSubscription.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    getStrategyOptions() {
        return { strategies: getStrategyAlertOptionsForApi() };
    }

    async createAlert(
        userId: string,
        symbol: string,
        strategyType: string,
        timeframes?: string[],
        directions?: string[],
    ) {
        if (!symbol || !strategyType) {
            throw new BadRequestException('Symbol and strategyType are required');
        }

        const normalizedSymbol = symbol.trim().toUpperCase();
        const canonStrategy = String(strategyType ?? '').trim().toUpperCase();
        if (!getStrategyDefinition(canonStrategy)) {
            throw new BadRequestException(
                `Unknown strategy "${strategyType}". Open strategy-options or pick a listed scanner.`,
            );
        }
        const tfJson = normalizeSubscriptionTimeframes(canonStrategy, timeframes);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (!user) throw new NotFoundException('User not found');

        const allowed = await this.pricingService.canAccessSymbol(userId, normalizedSymbol);
        if (!allowed) {
            throw new BadRequestException('This coin is available for PRO only. Upgrade to unlock all Telegram alerts.');
        }

        try {
            return await this.prisma.alertSubscription.create({
                data: {
                    userId,
                    symbol: normalizedSymbol,
                    strategyType: canonStrategy,
                    timeframes: tfJson,
                    directions: directions?.length ? directions : null,
                    minWinRate: null,
                },
            });
        } catch (error) {
            if (error.code === 'P2002') {
                throw new ConflictException('You are already tracking this coin with this strategy');
            }
            throw error;
        }
    }

    async updateAlert(
        userId: string,
        alertId: string,
        data: {
            timeframes?: string[];
            directions?: string[];
            isActive?: boolean;
        },
    ) {
        const alert = await this.prisma.alertSubscription.findUnique({
            where: { id: alertId },
        });

        if (!alert) {
            throw new NotFoundException('Alert subscription not found');
        }

        if (alert.userId !== userId) {
            throw new BadRequestException('You do not own this alert subscription');
        }

        const canonStrategy = String(alert.strategyType ?? '').trim().toUpperCase();
        const tfJson =
            data.timeframes !== undefined
                ? normalizeSubscriptionTimeframes(canonStrategy, data.timeframes)
                : undefined;

        return this.prisma.alertSubscription.update({
            where: { id: alertId },
            data: {
                timeframes: tfJson !== undefined ? tfJson : undefined,
                directions: data.directions !== undefined ? (data.directions?.length ? data.directions : null) : undefined,
                isActive: data.isActive !== undefined ? data.isActive : undefined,
            },
        });
    }

    async deleteAlert(userId: string, alertId: string) {
        const alert = await this.prisma.alertSubscription.findUnique({
            where: { id: alertId },
        });

        if (!alert) {
            throw new NotFoundException('Alert subscription not found');
        }

        if (alert.userId !== userId) {
            throw new BadRequestException('You do not own this alert subscription');
        }

        await this.prisma.alertSubscription.delete({
            where: { id: alertId },
        });

        return { success: true };
    }

    async saveTelegramId(userId: string, telegramId: string) {
        const tid = String(telegramId ?? '').trim();
        if (!tid) {
            throw new BadRequestException('telegramId is required');
        }

        try {
            await this.prisma.user.update({
                where: { id: userId },
                data: { telegramId: tid },
            });
            return { success: true };
        } catch (error) {
            if (error.code === 'P2002') {
                throw new ConflictException('This Telegram ID is already linked to another account');
            }
            throw error;
        }
    }

    async getTelegramId(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { telegramId: true },
        });
        return { telegramId: user?.telegramId || null };
    }

    async clearTelegramId(userId: string) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { telegramId: null },
        });
        await this.prisma.telegramLinkCode.deleteMany({ where: { userId } });
        return { success: true };
    }

    /**
     * Creates a one-time deep link (t.me/bot?start=link_CODE) for linking this account to Telegram.
     */
    async createTelegramDeepLink(userId: string): Promise<{ openUrl: string; expiresInMinutes: number }> {
        await this.prisma.telegramLinkCode.deleteMany({ where: { userId } });
        const code = randomBytes(12).toString('hex').slice(0, 20);
        const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_MS);
        await this.prisma.telegramLinkCode.create({
            data: { code, userId, expiresAt },
        });
        const botUser = (process.env.TELEGRAM_BOT_USERNAME || 'Liquidityscanio_bot').replace(/^@/, '');
        const startPayload = `link_${code}`;
        if (startPayload.length > 64) {
            throw new BadRequestException('Link payload too long');
        }
        const openUrl = `https://t.me/${botUser}?start=${encodeURIComponent(startPayload)}`;
        return { openUrl, expiresInMinutes: 15 };
    }

    /**
     * Called from the Telegram bot when the user opens a link with start=link_CODE.
     */
    async linkTelegramChatFromCode(startPayload: string, telegramChatId: string): Promise<{ ok: boolean; message: string }> {
        const raw = startPayload.trim();
        if (!raw.startsWith('link_')) {
            return { ok: false, message: 'Invalid link. Open a new link from the website (Settings → Telegram).' };
        }
        const code = raw.slice('link_'.length);
        if (!code) {
            return { ok: false, message: 'Invalid link code.' };
        }
        const row = await this.prisma.telegramLinkCode.findUnique({ where: { code } });
        if (!row || row.expiresAt < new Date()) {
            return { ok: false, message: 'This link has expired. Generate a new one on the website.' };
        }
        try {
            await this.prisma.user.update({
                where: { id: row.userId },
                data: { telegramId: telegramChatId },
            });
            await this.prisma.telegramLinkCode.delete({ where: { code: row.code } });
            return {
                ok: true,
                message: 'Telegram connected. You can set up alerts on the site.',
            };
        } catch (error: any) {
            if (error.code === 'P2002') {
                return {
                    ok: false,
                    message: 'This Telegram account is already linked to another LiquidityScan user.',
                };
            }
            throw error;
        }
    }
}
