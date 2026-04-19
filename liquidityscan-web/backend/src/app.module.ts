import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { pinoParams } from './common/logger.config';
import { DebugController } from './common/debug.controller';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';
import { CoursesModule } from './courses/courses.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { CandlesModule } from './candles/candles.module';
import { SignalsModule } from './signals/signals.module';
import { TelegramModule } from './telegram/telegram.module';
import { AlertsModule } from './alerts/alerts.module';
import { PricingModule } from './pricing/pricing.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MailModule } from './mail/mail.module';
import { AppConfigModule } from './app-config/app-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule.forRoot(pinoParams),
    // PR 3.3 — named throttlers. Per-route @Throttle({ <name>: ... })
    // overrides the named window. ThrottlerGuard evaluates every
    // registered throttler, so `default` stays a safety net on routes
    // that only opt into `strict` or `burst`.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 120 },
      { name: 'strict', ttl: 60000, limit: 10 },
      { name: 'burst', ttl: 300000, limit: 5 },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    AdminModule,
    PaymentsModule,
    CoursesModule,
    SubscriptionsModule,
    CandlesModule,
    SignalsModule,
    TelegramModule,
    AlertsModule,
    PricingModule,
    AffiliateModule,
    RealtimeModule,
    MailModule,
    AppConfigModule,
  ],
  controllers: [AppController, DebugController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
  ],
})
export class AppModule { }

