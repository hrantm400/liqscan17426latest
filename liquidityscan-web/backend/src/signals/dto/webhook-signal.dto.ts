import { IsString, IsNumber, IsOptional, IsIn, IsObject } from 'class-validator';

/** Allowed timeframes for different strategies */
export const SUPER_ENGULFING_TIMEFRAMES = ['4h', '1d', '1w'] as const;
export const RSI_DIVERGENCE_TIMEFRAMES = ['1h', '4h', '1d'] as const;
export const ICT_BIAS_TIMEFRAMES = ['4h', '1d', '1w'] as const;
export const CRT_TIMEFRAMES = ['1h', '4h', '1d', '1w'] as const;
export const THREE_OB_TIMEFRAMES = ['4h', '1d', '1w'] as const;
export const CISD_TIMEFRAMES = ['4h', '1d', '1w'] as const;

export const ALL_TIMEFRAMES = [
  ...new Set([
    ...SUPER_ENGULFING_TIMEFRAMES,
    ...RSI_DIVERGENCE_TIMEFRAMES,
    ...ICT_BIAS_TIMEFRAMES,
    ...CRT_TIMEFRAMES,
    ...THREE_OB_TIMEFRAMES,
    ...CISD_TIMEFRAMES,
  ]),
] as const;

export const ALL_STRATEGY_TYPES = [
  'SUPER_ENGULFING',
  'SUPERENGULFING',
  'RSI_DIVERGENCE',
  'RSIDIVERGENCE',
  'ICT_BIAS',
  'ICTBIAS',
  'CRT',
  'STRATEGY1',
  '3OB',
  'CISD',
] as const;

export class WebhookSignalDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsIn(ALL_STRATEGY_TYPES)
  strategyType: string;

  @IsString()
  symbol: string;

  @IsString()
  @IsIn(ALL_TIMEFRAMES)
  timeframe: string;

  @IsString()
  @IsIn(['BUY', 'SELL', 'NEUTRAL'])
  signalType: string;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  detectedAt?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'ARCHIVED'])
  lifecycleStatus?: string;

  @IsOptional()
  @IsString()
  @IsIn(['WIN', 'LOSS'])
  result?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'EXPIRED', 'FILLED', 'CLOSED', 'HIT_TP', 'HIT_SL'])
  status?: string; // deprecated string but kept for backward compatibility if webhooks still send it

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
