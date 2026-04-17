import { Module } from '@nestjs/common';
import { CandlesModule } from '../candles/candles.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [CandlesModule, AuthModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}

