import { Controller, Get, Post, Body, Query, Param, NotFoundException, Logger, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { AdminGuard } from '../admin/guards/admin.guard';
import { SignalsService } from './signals.service';
import { ScannerService } from './scanner.service';
import { detectICTBias } from './indicators';

@Controller('signals')
export class SignalsController {
  private readonly logger = new Logger(SignalsController.name);

  constructor(
    private readonly signalsService: SignalsService,
    private readonly scannerService: ScannerService,
  ) { }

  @Post('scan')
  async runScan() {
    if (!this.scannerService.isMarketScannerEnabled()) {
      this.logger.warn('POST /signals/scan ignored: market scanner disabled (MARKET_SCANNER_ENABLED=false)');
      return {
        status: 'skipped',
        message: 'Market scanner is disabled. Set MARKET_SCANNER_ENABLED=true in .env and restart the API.',
      };
    }
    this.logger.log('Manual scan triggered via POST /signals/scan');
    await this.scannerService.scanBasicStrategies();
    return { status: 'Scan completed' };
  }

  /** No auth: used by ops (curl / browser) to verify MARKET_SCANNER_ENABLED after deploy. */
  @Public()
  @Get('market-scanner-status')
  marketScannerStatus() {
    return {
      enabled: this.scannerService.isMarketScannerEnabled(),
    };
  }



  @Post('ict-bias')
  // PR 3.3 — DoS guard on the heavy detectICTBias compute path.
  // IP-tracked (default) rather than user-tracked to cover both the
  // authenticated and anonymous frontend call paths uniformly.
  @UseGuards(ThrottlerGuard)
  @Throttle({ strict: { limit: 60, ttl: 60000 } })
  @SkipThrottle({ burst: true })
  async getIctBias(@Body() candles: any[]) {
    const result = detectICTBias(candles);
    if (!result) return { bias: 'RANGING', message: 'Not enough data' };
    return {
      bias: result.bias,
      message: `ICT Bias: ${result.bias} (${result.direction})`
    };
  }

  @Get('live-bias')
  async getLiveBias(@Query('timeframe') timeframe?: string) {
    const tf = timeframe || '4h';
    return this.scannerService.getLiveBias(tf);
  }

  @Get('rsi-config')
  @UseGuards(AdminGuard)
  getRsiConfig() {
    return this.scannerService.getRsiConfig();
  }

  @Post('rsi-config')
  @UseGuards(AdminGuard)
  setRsiConfig(
    @Body()
    config: {
      lbL?: number;
      lbR?: number;
      rangeLower?: number;
      rangeUpper?: number;
      limitUpper?: number;
      limitLower?: number;
    },
  ) {
    return this.scannerService.setRsiConfig(config ?? {});
  }

  @Get('stats')
  async getStats(@Query('strategyType') strategyType?: string) {
    return this.signalsService.getSignalStats(strategyType || undefined);
  }

  @Get('daily-recap')
  async getDailyRecap(@Query('date') date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.signalsService.getDailyRecap(targetDate);
  }

  @Get('market-overview')
  async getMarketOverview(@Query('date') date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.signalsService.getMarketOverview(targetDate);
  }

  @Get(':id')
  async getSignalById(@Param('id') id: string) {
    const signal = await this.signalsService.getSignalById(id);
    if (!signal) {
      throw new NotFoundException(`Signal ${id} not found`);
    }
    return signal;
  }

  @Get()
  getSignals(
    @Query('strategyType') strategyType?: string,
    @Query('limit') limit?: string,
    @Query('minVolume') minVolume?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedMinVolume = minVolume ? parseInt(minVolume, 10) : undefined;
    return this.signalsService.getSignals(strategyType || undefined, parsedLimit, parsedMinVolume).then((list) => {
      // this.logger.log(`GET /signals strategyType=${strategyType ?? 'all'} -> ${list.length} signals`);
      return list;
    });
  }
}
