import { Injectable, Logger } from '@nestjs/common';
import { CandlesService } from './candles.service';
import { CandleSnapshotService } from './candle-snapshot.service';
import type { CandleData } from '../signals/indicators';

@Injectable()
export class CandleFetchJob {
  private readonly logger = new Logger(CandleFetchJob.name);
  private inFlight: Promise<{ symbolCount: number; elapsedMs: number; upsertedRows: number }> | null = null;

  // Phase 7.3 — 15m/5m added for WS bootstrap parity. Limits tuned so
  // each TF has roughly the same calendar coverage as the hourly TF
  // (i.e. ~12 days of history). This keeps REST-fallback cold starts
  // fast without blowing out the per-symbol per-TF candle payload size.
  private static readonly INTERVALS: { interval: string; limit: number }[] = [
    { interval: '1h', limit: 300 },
    { interval: '4h', limit: 300 },
    { interval: '1d', limit: 300 },
    { interval: '1w', limit: 200 },
    { interval: '15m', limit: 500 },
    { interval: '5m', limit: 500 },
  ];

  constructor(
    private readonly candlesService: CandlesService,
    private readonly candleSnapshotService: CandleSnapshotService,
  ) {}

  /**
   * Download klines for all USDT perpetual symbols into candle_snapshots (one row per symbol+interval).
   */
  async fetchAllCandles(): Promise<{ symbolCount: number; elapsedMs: number; upsertedRows: number }> {
    if (this.inFlight) {
      this.logger.log('fetchAllCandles: another invocation in progress, joining...');
      return this.inFlight;
    }
    this.inFlight = this.doFetchAllCandles();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async doFetchAllCandles(): Promise<{ symbolCount: number; elapsedMs: number; upsertedRows: number }> {
    const start = Date.now();
    const symbols = await this.candlesService.fetchSymbols();
    if (symbols.length === 0) {
      this.logger.warn('CandleFetchJob: no symbols from exchange');
      return { symbolCount: 0, elapsedMs: Date.now() - start, upsertedRows: 0 };
    }

    let upserted = 0;
    const CHUNK = 4;
    const DELAY_MS = 2000;

    for (let i = 0; i < symbols.length; i += CHUNK) {
      const chunk = symbols.slice(i, i + CHUNK);
      const tasks: Promise<void>[] = [];

      for (const symbol of chunk) {
        for (const { interval, limit } of CandleFetchJob.INTERVALS) {
          tasks.push(
            (async () => {
              const klines = await this.candlesService.getKlines(symbol, interval, limit);
              const candles: CandleData[] = klines.map((k) => ({
                openTime: k.openTime,
                open: k.open,
                high: k.high,
                low: k.low,
                close: k.close,
                volume: k.volume,
              }));
              await this.candleSnapshotService.upsertSnapshot(symbol, interval, candles);
              upserted += 1;
            })(),
          );
        }
      }

      await Promise.all(tasks);

      const done = Math.min(i + CHUNK, symbols.length);
      if (done % 40 === 0 || done >= symbols.length) {
        this.logger.log(`CandleFetchJob: persisted snapshots ${done}/${symbols.length} symbols...`);
      }

      if (i + CHUNK < symbols.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    const elapsedMs = Date.now() - start;
    this.logger.log(
      `CandleFetchJob: completed ${symbols.length} symbols, ${upserted} upserts, ${(elapsedMs / 1000).toFixed(1)}s`,
    );

    return { symbolCount: symbols.length, elapsedMs, upsertedRows: upserted };
  }
}
