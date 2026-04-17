import { Controller, Get, Param, Query } from '@nestjs/common';
import { CandlesService } from './candles.service';

@Controller('candles')
export class CandlesController {
  constructor(private readonly candlesService: CandlesService) {}

  /**
   * GET /api/candles/:symbol/:interval
   * Fetches klines from Binance for the given symbol and interval.
   * Query: limit (optional, default 500, max 1000).
   * Returns 200 with array of { openTime, open, high, low, close, volume }; empty array on error.
   */
  @Get(':symbol/:interval')
  async getKlines(
    @Param('symbol') symbol: string,
    @Param('interval') interval: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit != null ? parseInt(limit, 10) : 500;
    return this.candlesService.getKlines(symbol, interval, limitNum);
  }
}
