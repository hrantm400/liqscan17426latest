import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionReminderService } from './subscription-reminder.service';
import { TelegramModule } from '../telegram/telegram.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule, TelegramModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionReminderService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
