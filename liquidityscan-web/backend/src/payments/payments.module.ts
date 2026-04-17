import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TronScannerService } from './tron-scanner.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, AuthModule, MailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, TronScannerService],
  exports: [PaymentsService],
})
export class PaymentsModule { }
