import { Module } from '@nestjs/common';
import { CandlesController } from './candles.controller';
import { CandlesService } from './candles.service';
import { CandleFetchJob } from './candle-fetch.job';
import { CandleSnapshotService } from './candle-snapshot.service';
import { BinanceWsManager } from './binance-ws.manager';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CandlesController],
  providers: [CandlesService, CandleSnapshotService, CandleFetchJob, BinanceWsManager],
  exports: [CandlesService, CandleSnapshotService, CandleFetchJob, BinanceWsManager],
})
export class CandlesModule { }
