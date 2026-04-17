import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Commission rates by affiliate tier
const COMMISSION_RATES: Record<string, number> = {
    STANDARD: 0.30,  // 30%
    ELITE: 0.40,     // 40% (50+ sales)
    AGENCY: 0.20,    // 20% lifetime
};

// Threshold to upgrade to ELITE
const ELITE_THRESHOLD = 50;

@Injectable()
export class AffiliateService {
    private readonly logger = new Logger(AffiliateService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * Generate unique affiliate code for a user
     */
    async createAffiliate(userId: string, customCode?: string): Promise<any> {
        // Check if user already has an affiliate account
        const existing = await this.prisma.affiliate.findUnique({ where: { userId } });
        if (existing) return existing;

        const code = customCode?.toUpperCase().replace(/[^A-Z0-9]/g, '') ||
            await this.generateUniqueCode(userId);

        // Ensure code is unique
        const codeExists = await this.prisma.affiliate.findUnique({ where: { code } });
        if (codeExists) throw new BadRequestException('Code already taken');

        const affiliate = await this.prisma.affiliate.create({
            data: { userId, code },
        });

        // Also store code on user for quick lookup
        await this.prisma.user.update({
            where: { id: userId },
            data: { affiliateCode: code },
        });

        this.logger.log(`Affiliate created: ${code} for user ${userId}`);
        return affiliate;
    }

    /**
     * Track a referral when a new user signs up with a code
     */
    async trackReferral(affiliateCode: string, newUserId: string): Promise<void> {
        const affiliate = await this.prisma.affiliate.findUnique({
            where: { code: affiliateCode.toUpperCase() },
        });
        if (!affiliate || !affiliate.isActive) return;

        // Don't allow self-referral
        if (affiliate.userId === newUserId) return;

        // Check if this user was already referred
        const existing = await this.prisma.affiliateReferral.findUnique({
            where: { referredUserId: newUserId },
        });
        if (existing) return;

        await this.prisma.affiliateReferral.create({
            data: {
                affiliateId: affiliate.id,
                referredUserId: newUserId,
                status: 'REGISTERED',
            },
        });

        // Store referrer on user
        await this.prisma.user.update({
            where: { id: newUserId },
            data: { referrerId: affiliate.userId },
        });

        this.logger.log(`Referral tracked: ${affiliateCode} → ${newUserId}`);
    }

    /**
     * Credit commission when a referred user pays
     */
    async creditCommission(referredUserId: string, paymentAmount: number): Promise<void> {
        const referral = await this.prisma.affiliateReferral.findUnique({
            where: { referredUserId },
            include: { affiliate: true },
        });
        if (!referral) return;

        const rate = COMMISSION_RATES[referral.affiliate.tier] || 0.30;
        const commission = paymentAmount * rate;

        // Update referral
        await this.prisma.affiliateReferral.update({
            where: { id: referral.id },
            data: {
                paymentAmount,
                commission,
                status: 'CONVERTED',
            },
        });

        // Update affiliate totals
        await this.prisma.affiliate.update({
            where: { id: referral.affiliateId },
            data: {
                totalSales: { increment: 1 },
                totalEarned: { increment: commission },
            },
        });

        // Auto-upgrade to ELITE if threshold reached
        const freshAffiliate = await this.prisma.affiliate.findUnique({
            where: { id: referral.affiliateId },
        });
        if (freshAffiliate && freshAffiliate.totalSales >= ELITE_THRESHOLD && freshAffiliate.tier === 'STANDARD') {
            await this.prisma.affiliate.update({
                where: { id: referral.affiliateId },
                data: { tier: 'ELITE' },
            });
            this.logger.log(`Affiliate ${freshAffiliate.code} auto-upgraded to ELITE (${freshAffiliate.totalSales} sales)`);
        }

        this.logger.log(`Commission credited: $${commission.toFixed(2)} (${(rate * 100)}%) for affiliate ${referral.affiliate.code}`);
    }

    /**
     * Get affiliate dashboard stats
     */
    async getStats(userId: string): Promise<any> {
        const affiliate = await this.prisma.affiliate.findUnique({
            where: { userId },
            include: {
                referrals: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
                payouts: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
            },
        });

        if (!affiliate) return null;

        const totalReferrals = await this.prisma.affiliateReferral.count({
            where: { affiliateId: affiliate.id },
        });
        const totalConverted = await this.prisma.affiliateReferral.count({
            where: { affiliateId: affiliate.id, status: 'CONVERTED' },
        });

        return {
            code: affiliate.code,
            tier: affiliate.tier,
            commissionRate: (COMMISSION_RATES[affiliate.tier] || 0.30) * 100,
            totalSales: affiliate.totalSales,
            totalEarned: affiliate.totalEarned,
            totalReferrals,
            totalConverted,
            conversionRate: totalReferrals > 0 ? ((totalConverted / totalReferrals) * 100).toFixed(1) : '0',
            referralLink: `https://liquidityscan.io/?ref=${affiliate.code}`,
            recentReferrals: affiliate.referrals,
            recentPayouts: affiliate.payouts,
        };
    }

    /**
     * Get referral info for the profile page
     */
    async getReferralInfo(userId: string): Promise<any> {
        const affiliate = await this.prisma.affiliate.findUnique({
            where: { userId },
        });

        if (!affiliate) return null;

        const totalReferrals = await this.prisma.affiliateReferral.count({
            where: { affiliateId: affiliate.id },
        });

        const aggregatePayouts = await this.prisma.affiliatePayout.aggregate({
            where: { affiliateId: affiliate.id, status: 'PROCESSED' },
            _sum: { amount: true },
        });

        const paidEarned = Number(aggregatePayouts._sum.amount || 0);
        const pendingEarned = Math.max(0, affiliate.totalEarned - paidEarned);

        return {
            referralCode: affiliate.code,
            referralLink: `https://liquidityscan.io/?ref=${affiliate.code}`,
            stats: {
                referredCount: totalReferrals,
                pendingEarned: pendingEarned.toString(),
                paidEarned: paidEarned.toString(),
            }
        };
    }

    /**
     * Get affiliate by code (for validating ref links)
     */
    async getByCode(code: string): Promise<any> {
        const affiliate = await this.prisma.affiliate.findUnique({
            where: { code: code.toUpperCase() },
            include: { user: { select: { name: true } } },
        });
        if (!affiliate || !affiliate.isActive) return null;
        return { code: affiliate.code, name: affiliate.user.name };
    }

    /**
     * Generate a unique code from userId
     */
    private async generateUniqueCode(userId: string): Promise<string> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const base = (user?.name || user?.email?.split('@')[0] || 'LS')
            .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
        const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${base}${suffix}`;
    }
}
