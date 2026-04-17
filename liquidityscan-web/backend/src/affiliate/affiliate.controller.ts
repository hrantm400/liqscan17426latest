import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('affiliate')
export class AffiliateController {
    constructor(private affiliateService: AffiliateService) { }

    /**
     * POST /affiliate/create - Create affiliate account (generates code)
     */
    @Post('create')
    async create(@Req() req: any, @Body() body: { code?: string }) {
        return this.affiliateService.createAffiliate(req.user.userId, body.code);
    }

    /**
     * GET /affiliate/stats - Get affiliate dashboard stats
     */
    @Get('stats')
    async getStats(@Req() req: any) {
        return this.affiliateService.getStats(req.user.userId);
    }

    /**
     * GET /affiliate/me - Get referral info for the current user (for Profile page)
     */
    @Get('me')
    async getReferralInfo(@Req() req: any) {
        return this.affiliateService.getReferralInfo(req.user.userId);
    }

    /**
     * GET /affiliate/validate/:code - Validate a referral code (public)
     */
    @Get('validate/:code')
    @Public()
    async validate(@Param('code') code: string) {
        const result = await this.affiliateService.getByCode(code);
        return result || { valid: false };
    }
}
