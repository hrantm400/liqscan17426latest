import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IExchangeProvider, IKline } from '../providers/data-provider.interface';
import { BinanceProvider } from '../providers/binance.provider';

export type CandleDto = IKline;

@Injectable()
export class CandlesService {
  private readonly logger = new Logger(CandlesService.name);
  private binanceProvider = new BinanceProvider();

  private cache = new Map<string, { timestamp: number, data: CandleDto[] }>();

  private readonly CACHE_TTL_BY_INTERVAL: Record<string, number> = {
    '5m': 15_000,
    '15m': 30_000,
    '1h': 60_000,
    '4h': 120_000,
    '1d': 300_000,
    '1w': 900_000,
  };
  private readonly DEFAULT_CACHE_TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) { }

  private getCacheTTL(interval: string): number {
    return this.CACHE_TTL_BY_INTERVAL[interval] || this.DEFAULT_CACHE_TTL_MS;
  }

  private async getProvider(): Promise<IExchangeProvider> {
    return this.binanceProvider;
  }

  async getKlines(symbol: string, interval: string, limit = 500): Promise<CandleDto[]> {
    const sym = (symbol || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (sym === 'USDT' || sym.length < 5) {
      return [];
    }
    const limitParam = Math.min(Math.max(1, Number(limit) || 500), 1000);

    const cacheKey = `${sym}_${interval}_${limitParam}`;
    const cached = this.cache.get(cacheKey);
    const ttl = this.getCacheTTL(interval);

    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }

    try {
      const provider = await this.getProvider();
      const out = await provider.getKlines(sym, interval, limitParam);
      this.cache.set(cacheKey, { timestamp: Date.now(), data: out });
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Provider fetch error for ${sym} ${interval}: ${msg}`);
      return [];
    }
  }

  async fetchSymbols(): Promise<string[]> {
    try {
      const provider = await this.getProvider();
      return await provider.fetchSymbols();
    } catch (err) {
      this.logger.warn(`Failed to fetch symbols: ${err.message}`);
      return ['BTCUSDT', 'ETHUSDT'];
    }
  }

  async getCurrentPrices(): Promise<Map<string, number>> {
    try {
      const provider = await this.getProvider();
      return await provider.getCurrentPrices();
    } catch (err) {
      this.logger.warn(`Failed to fetch current prices: ${err.message}`);
      return new Map();
    }
  }
}
