import { IsString, IsOptional, IsNumber, IsNotEmpty, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  tier: string; // SCOUT | FULL_ACCESS

  @IsNumber()
  tierNumber: number; // 0-4

  @IsNumber()
  priceMonthly: number;

  @IsNumber()
  @IsOptional()
  priceYearly?: number;

  @IsNumber()
  @IsOptional()
  duration?: number; // in days, default 30

  @IsArray()
  @IsOptional()
  markets?: string[]; // ["crypto", "forex", "indices", "commodities"]

  @IsNumber()
  @IsOptional()
  pairsLimit?: number; // null = unlimited

  @IsArray()
  @IsOptional()
  timeframes?: string[]; // ["15m", "1H", "4H", "Daily"]

  @IsArray()
  @IsOptional()
  signalTypes?: string[]; // ["Standard", "REV+", "RUN+"]

  @IsArray()
  @IsOptional()
  features?: string[];

  @IsOptional()
  limits?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isPopular?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
