import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
    imports: [PrismaModule, PricingModule],
    controllers: [AlertsController],
    providers: [AlertsService],
    exports: [AlertsService]
})
export class AlertsModule { }
