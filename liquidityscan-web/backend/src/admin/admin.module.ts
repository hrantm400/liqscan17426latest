import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from './guards/admin.guard';
import { MailModule } from '../mail/mail.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PaymentsModule } from '../payments/payments.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { BackupsModule } from './backups/backups.module';
import { CoreLayerModule } from '../core-layer/core-layer.module';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule, MailModule, TelegramModule, PaymentsModule, AppConfigModule, BackupsModule, CoreLayerModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
