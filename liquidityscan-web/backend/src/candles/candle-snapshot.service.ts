import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CandleData } from '../signals/indicators';

function isCandleRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseCandlesJson(raw: unknown): CandleData[] {
  if (!Array.isArray(raw)) return [];
  const out: CandleData[] = [];
  for (const row of raw) {
    if (!isCandleRecord(row)) continue;
    const openTime = Number(row.openTime);
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    const volume = Number(row.volume);
    if (
      !Number.isFinite(openTime) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      continue;
    }
    out.push({ openTime, open, high, low, close, volume });
  }
  return out;
}

@Injectable()
export class CandleSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertSnapshot(symbol: string, interval: string, candles: CandleData[]): Promise<void> {
    const sym = (symbol || '').toUpperCase();
    const intv = String(interval || '').trim();
    if (!sym || !intv) return;

    const json = JSON.parse(JSON.stringify(candles)) as Prisma.InputJsonValue;

    await this.prisma.candleSnapshot.upsert({
      where: {
        symbol_interval: { symbol: sym, interval: intv },
      },
      create: {
        symbol: sym,
        interval: intv,
        candles: json,
      },
      update: {
        candles: json,
      },
    });
  }

  async getSnapshot(symbol: string, interval: string): Promise<CandleData[]> {
    const sym = (symbol || '').toUpperCase();
    const intv = String(interval || '').trim();
    const row = await this.prisma.candleSnapshot.findUnique({
      where: { symbol_interval: { symbol: sym, interval: intv } },
    });
    if (!row) return [];
    return parseCandlesJson(row.candles);
  }

  async getSnapshotSlice(symbol: string, interval: string, limit: number): Promise<CandleData[]> {
    const all = await this.getSnapshot(symbol, interval);
    if (all.length === 0) return [];
    const n = Math.max(1, Math.min(1000, Math.floor(limit)));
    return all.slice(-n);
  }

  /**
   * Stage 3 (2026-04-26): per-interval streaming load. Caller invokes this
   * sequentially (once per interval) and copies into the live store between
   * calls, allowing V8 to release the previous interval's Map before allocating
   * the next one. Peak memory drops from ~700MB (full Map of all 6 intervals)
   * to ~120MB (single interval), eliminating the transient peak in
   * BinanceWsManager.bootstrapStore that previously triggered pm2 cascade
   * restarts (see INCIDENTS.md, PR #36).
   *
   * Returns Map keyed by symbol → CandleData[] for the given interval.
   */
  async loadSnapshotsByInterval(interval: string): Promise<Map<string, CandleData[]>> {
    const result = new Map<string, CandleData[]>();
    const rows = await this.prisma.candleSnapshot.findMany({
      where: { interval },
      select: { symbol: true, candles: true },
    });
    for (const row of rows) {
      const candles = parseCandlesJson(row.candles);
      if (candles.length > 0) {
        result.set(row.symbol, candles);
      }
    }
    return result;
  }

  async deleteAllSnapshots(): Promise<number> {
    const r = await this.prisma.candleSnapshot.deleteMany({});
    return r.count;
  }

  /** Milliseconds since row was updated, or null if missing. */
  async getSnapshotAge(symbol: string, interval: string): Promise<number | null> {
    const sym = (symbol || '').toUpperCase();
    const intv = String(interval || '').trim();
    const row = await this.prisma.candleSnapshot.findUnique({
      where: { symbol_interval: { symbol: sym, interval: intv } },
      select: { updatedAt: true },
    });
    if (!row) return null;
    return Date.now() - row.updatedAt.getTime();
  }
}
