import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/app-config.service';

// FREE tier allowed symbols
const FREE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XAUUSDT', 'XAGUSDT'];

// All available features for granular access control
export const ALL_FEATURES = [
    'super_engulfing',
    'ict_bias',
    'rsi_divergence',
    'crt',
    'telegram_alerts',
    'academy',
    'tools',
    'watchlist',
] as const;
export type FeatureKey = typeof ALL_FEATURES[number] | 'all';

// FREE tier daily quotas
const FREE_RSI_QUOTA = 1;
const FREE_BIAS_QUOTA = 1;

export interface TierInfo {
    tier: string;
    /** Billing: user.tier !== FREE (unchanged by launch promo). */
    isPaid: boolean;
    /** Global admin flag: free accounts temporarily get full product access. */
    launchPromoActive: boolean;
    /** Monitors / product gating: paid OR (free + launch promo). */
    hasFullProductAccess: boolean;
    daysRemaining: number | null;
    canUseTelegram: boolean;
    symbolsAllowed: 'ALL' | string[];
    rsiQuota: number | null;    // null = unlimited
    biasQuota: number | null;
    rsiUsed: number;
    biasUsed: number;
    historyDays: number | null; // null = unlimited
    features: string[];         // granted feature keys
}

@Injectable()
export class PricingService {
    private readonly logger = new Logger(PricingService.name);

    constructor(
        private prisma: PrismaService,
        private appConfig: AppConfigService,
    ) { }

    @Cron('0 0 * * *')
    async cronExpireOverdueSubscriptions() {
        try {
            await this.expireOverdueSubscriptions();
        } catch (e) {
            this.logger.error('Failed to expire overdue subscriptions', e as any);
        }
    }

    /**
     * Get full tier info for a user
     */
    async getTierInfo(userId: string): Promise<TierInfo> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        // Reset daily quota if needed
        await this.resetDailyQuotaIfNeeded(userId);

        const launchPromoActive = await this.appConfig.getLaunchPromoFullAccess();
        const billingPaid = user.tier !== 'FREE';
        const hasFullProductAccess =
            billingPaid || (user.tier === 'FREE' && launchPromoActive);

        const daysRemaining = user.subscriptionExpiresAt
            ? Math.max(0, Math.ceil((new Date(user.subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : null;

        // Resolve features: full product access = all; else FREE = FeatureAccess grants
        let features: string[];
        if (hasFullProductAccess) {
            features = [...ALL_FEATURES];
        } else {
            const now = new Date();
            const grants = await this.prisma.featureAccess.findMany({
                where: { userId },
                select: { feature: true, expiresAt: true },
            });
            const activeGrants = grants.filter(g => !g.expiresAt || g.expiresAt > now);
            const hasAll = activeGrants.some(g => g.feature === 'all');
            features = hasAll ? [...ALL_FEATURES] : activeGrants.map(g => g.feature);
        }

        const hasTelegram = features.includes('telegram_alerts');

        return {
            tier: user.tier,
            isPaid: billingPaid,
            launchPromoActive,
            hasFullProductAccess,
            daysRemaining: billingPaid ? daysRemaining : null,
            canUseTelegram: hasFullProductAccess || hasTelegram,
            symbolsAllowed: hasFullProductAccess ? 'ALL' : FREE_SYMBOLS,
            rsiQuota: hasFullProductAccess ? null : FREE_RSI_QUOTA,
            biasQuota: hasFullProductAccess ? null : FREE_BIAS_QUOTA,
            rsiUsed: user.dailyRsiUsed,
            biasUsed: user.dailyBiasUsed,
            historyDays: hasFullProductAccess ? null : 1, // Free = 24h only
            features,
        };
    }

    /** True if tier should receive paid-equivalent product limits (not billing). */
    async hasFullProductAccessForTier(tier: string): Promise<boolean> {
        if (tier !== 'FREE') return true;
        return this.appConfig.getLaunchPromoFullAccess();
    }

    /**
     * Check if user can access a specific symbol
     */
    async canAccessSymbol(userId: string, symbol: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) return false;
        if (await this.hasFullProductAccessForTier(user.tier)) return true;
        return FREE_SYMBOLS.includes(symbol.toUpperCase());
    }

    /**
     * Check if user can view more RSI signals today
     */
    async canViewRsi(userId: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) return false;
        if (await this.hasFullProductAccessForTier(user.tier)) return true;
        await this.resetDailyQuotaIfNeeded(userId);
        const fresh = await this.prisma.user.findUnique({ where: { id: userId } });
        return (fresh?.dailyRsiUsed ?? 0) < FREE_RSI_QUOTA;
    }

    /**
     * Check if user can view more Bias signals today
     */
    async canViewBias(userId: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) return false;
        if (await this.hasFullProductAccessForTier(user.tier)) return true;
        await this.resetDailyQuotaIfNeeded(userId);
        const fresh = await this.prisma.user.findUnique({ where: { id: userId } });
        return (fresh?.dailyBiasUsed ?? 0) < FREE_BIAS_QUOTA;
    }

    /**
     * Increment daily RSI usage
     */
    async incrementRsi(userId: string): Promise<void> {
        await this.resetDailyQuotaIfNeeded(userId);
        await this.prisma.user.update({
            where: { id: userId },
            data: { dailyRsiUsed: { increment: 1 } },
        });
    }

    /**
     * Increment daily Bias usage
     */
    async incrementBias(userId: string): Promise<void> {
        await this.resetDailyQuotaIfNeeded(userId);
        await this.prisma.user.update({
            where: { id: userId },
            data: { dailyBiasUsed: { increment: 1 } },
        });
    }

    /**
     * Check if user can use Telegram alerts
     */
    async canUseTelegram(userId: string): Promise<boolean> {
        const info = await this.getTierInfo(userId);
        return info.canUseTelegram;
    }

    /**
     * Upgrade user tier after payment
     */
    async upgradeTier(userId: string, plan: 'PAID_MONTHLY' | 'PAID_ANNUAL'): Promise<void> {
        const durationDays = plan === 'PAID_ANNUAL' ? 365 : 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                tier: plan,
                subscriptionStatus: 'active',
                subscriptionExpiresAt: expiresAt,
            },
        });

        this.logger.log(`User ${userId} upgraded to ${plan}, expires ${expiresAt.toISOString()}`);
    }

    /**
     * Check and expire subscriptions past their expiry date (run via cron)
     */
    async expireOverdueSubscriptions(): Promise<number> {
        const now = new Date();
        const { count } = await this.prisma.user.updateMany({
            where: {
                tier: { not: 'FREE' },
                subscriptionExpiresAt: { lt: now },
            },
            data: {
                tier: 'FREE',
                subscriptionStatus: 'expired',
            },
        });
        if (count > 0) {
            this.logger.log(`Expired ${count} overdue subscriptions`);
        }
        return count;
    }

    /**
     * Reset daily quotas at midnight UTC
     */
    private async resetDailyQuotaIfNeeded(userId: string): Promise<void> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) return;

        const now = new Date();
        const resetAt = user.dailyQuotaResetAt;
        const nowDay = now.toISOString().substring(0, 10);
        const resetDay = resetAt.toISOString().substring(0, 10);

        if (nowDay !== resetDay) {
            await this.prisma.user.update({
                where: { id: userId },
                data: {
                    dailyRsiUsed: 0,
                    dailyBiasUsed: 0,
                    dailyQuotaResetAt: now,
                },
            });
        }
    }
}
