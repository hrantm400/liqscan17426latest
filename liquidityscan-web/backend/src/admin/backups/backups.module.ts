import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { AdminGuard } from '../guards/admin.guard';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [BackupsController],
  providers: [BackupsService, AdminGuard],
})
export class BackupsModule {}
