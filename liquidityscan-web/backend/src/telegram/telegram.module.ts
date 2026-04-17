import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramChartPlaywrightService } from './telegram-chart-playwright.service';
import { PrismaModule } from '../prisma/prisma.module'; // Import Prisma to check for subscribers
import { CandlesModule } from '../candles/candles.module';
import { PricingModule } from '../pricing/pricing.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
    imports: [PrismaModule, CandlesModule, PricingModule, AlertsModule],
    providers: [TelegramChartPlaywrightService, TelegramService],
    exports: [TelegramService],
})
export class TelegramModule { }
