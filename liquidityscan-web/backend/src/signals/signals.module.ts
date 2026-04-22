import { Module } from '@nestjs/common';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';
import { ScannerService } from './scanner.service';
import { CisdScanner } from './scanners/cisd.scanner';
import { CrtScanner } from './scanners/crt.scanner';
import { ThreeOBScanner } from './scanners/3ob.scanner';
import { IctBiasScanner } from './scanners/ict-bias.scanner';
import { RsiDivergenceScanner } from './scanners/rsi-divergence.scanner';
import { SuperEngulfingScanner } from './scanners/super-engulfing.scanner';
import { LifecycleService } from './lifecycle.service';
import { SignalStateService } from './signal-state.service';
import { SubHourScannerDispatcher } from './sub-hour-scanner.dispatcher';
import { PrismaModule } from '../prisma/prisma.module';
import { CandlesModule } from '../candles/candles.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AdminModule } from '../admin/admin.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { CoreLayerModule } from '../core-layer/core-layer.module';

@Module({
  imports: [PrismaModule, CandlesModule, TelegramModule, AdminModule, AppConfigModule, CoreLayerModule],
  controllers: [SignalsController],
  providers: [
    SignalsService,
    SuperEngulfingScanner,
    IctBiasScanner,
    RsiDivergenceScanner,
    CrtScanner,
    ThreeOBScanner,
    CisdScanner,
    ScannerService,
    LifecycleService,
    SignalStateService,
    SubHourScannerDispatcher,
  ],
  exports: [SignalsService],
})
export class SignalsModule { }
