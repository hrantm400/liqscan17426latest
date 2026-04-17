import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AppConfigModule } from '../app-config/app-config.module';

@Module({
    imports: [PrismaModule, AppConfigModule],
    controllers: [PricingController],
    providers: [PricingService],
    exports: [PricingService],
})
export class PricingModule { }
