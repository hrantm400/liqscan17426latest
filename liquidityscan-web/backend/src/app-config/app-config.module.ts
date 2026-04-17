import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AppConfigService } from './app-config.service';

@Module({
    imports: [PrismaModule],
    providers: [AppConfigService],
    exports: [AppConfigService],
})
export class AppConfigModule {}
