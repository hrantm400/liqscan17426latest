import { Controller, Get, Req } from '@nestjs/common';
import { PricingService } from './pricing.service';

@Controller('pricing')
export class PricingController {
    constructor(private pricingService: PricingService) { }

    /**
     * GET /pricing/tier - Get current user's tier info
     */
    @Get('tier')
    async getTier(@Req() req: any) {
        return this.pricingService.getTierInfo(req.user.userId);
    }
}
