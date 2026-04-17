import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_TIMEFRAMES, ALL_STRATEGY_TYPES } from './dto/webhook-signal.dto';

const MAX_SIGNALS = 5000;
const ALLOWED_TF = new Set<string>(ALL_TIMEFRAMES);

/** How many closed candles of the signal's timeframe may pass before RSI divergence is force-closed. */
export const RSI_STALE_MAX_CANDLES = 15;

/** Candle duration in ms — used for RSI stale closure (15 candles) and deletes. */
export const SIGNAL_TIMEFRAME_MS: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
    '1w': 604_800_000,
};

const RSI_DIVERGENCE_STRATEGY_TYPES = ['RSIDIVERGENCE', 'RSI_DIVERGENCE'] as const;

/** Scanner emits RSIDIVERGENCE-*; legacy rows may use RSI_DIVERGENCE-* with the same suffix. */
export function expandConfirmedRsiDivergenceIds(currentActiveIds: string[]): string[] {
    const expanded = new Set<string>();
    const prefixNew = 'RSIDIVERGENCE-';
    const prefixLegacy = 'RSI_DIVERGENCE-';
    for (const id of currentActiveIds) {
        expanded.add(id);
        if (id.startsWith(prefixNew)) {
            expanded.add(prefixLegacy + id.slice(prefixNew.length));
        }
    }
    return Array.from(expanded);
}

export type WebhookSignalInput = {
  id?: string;
  strategyType: string;
  symbol: string;
  timeframe: string;
  signalType: string;
  price: number;
  detectedAt?: string;
  /** Persisted on the row when supported by createMany (chart markers, closed hooks). */
  closedAt?: string;
  lifecycleStatus?: string;
  result?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  /** When true, skip Telegram for this row (e.g. historical CISD markers). */
  suppressTelegramAlert?: boolean;
};

class StoredSignal {
  id: string;
  strategyType: string;
  symbol: string;
  timeframe: string;
  signalType: string;
  price: number;
  detectedAt: string;
  lifecycleStatus?: string;
  result?: string;
  status: string;
  metadata?: unknown;
  closedAt?: string;
  closedPrice?: number;
  pnlPercent?: number;
  outcome?: string;
}

/** Grno payload: body.signals is array of { symbol, price, signals_by_timeframe: { "1d": { signals: ["REV Bull"], price, time }, ... } } */
function transformGrnoPayloadToSignals(body: unknown): WebhookSignalInput[] {
  if (body == null || typeof body !== 'object' || !Array.isArray((body as any).signals)) {
    return [];
  }
  const grno = body as { signals: Array<{ symbol: string; price: number; signals_by_timeframe?: Record<string, { signals?: string[]; price?: number; time?: string }> }> };
  const nowIso = new Date().toISOString();
  const out: WebhookSignalInput[] = [];

  for (const item of grno.signals) {
    const symbol = String((item as any).symbol ?? '');
    const fallbackPrice = Number((item as any).current_price ?? (item as any).price) || 0;
    // Webhook sends coin.signals (timeframe map); API sends signals_by_timeframe
    let byTfRaw = (item as any).signals_by_timeframe ?? (item as any).signalsByTimeframe ?? (item as any).signals;
    if (!byTfRaw || typeof byTfRaw !== 'object' || Array.isArray(byTfRaw)) {
      // Fallback: coin may have 4h/1d/1w at top level
      byTfRaw = {};
      for (const tf of ['4h', '1d', '1w']) {
        const block = (item as any)[tf];
        if (block != null && typeof block === 'object') (byTfRaw as any)[tf] = block;
      }
    }
    const byTf = byTfRaw && typeof byTfRaw === 'object' && !Array.isArray(byTfRaw) ? byTfRaw : {};

    for (const tf of Object.keys(byTf)) {
      const tfNorm = tf.toLowerCase();
      if (!ALLOWED_TF.has(tfNorm)) continue; // ignore non-allowed timeframes
      const block = byTf[tf];
      const signalsList = Array.isArray(block?.signals) ? block.signals : (typeof (block as any)?.signal === 'string' ? [(block as any).signal] : []);
      const blockPrice = (block as any)?.current_price ?? (block as any)?.price;
      const price = typeof blockPrice === 'number' ? blockPrice : fallbackPrice;
      const detectedAt = typeof (block as any)?.time === 'string' ? (block as any).time : nowIso;
      const firstSignal = signalsList[0];
      const signalType = typeof firstSignal === 'string' && firstSignal.toLowerCase().includes('bear') ? 'SELL' : 'BUY';
      out.push({
        strategyType: 'SUPER_ENGULFING',
        symbol,
        timeframe: tfNorm,
        signalType,
        price,
        detectedAt,
      });
    }
  }
  return out;
}

import { TelegramService } from '../telegram/telegram.service';
import { CandlesService } from '../candles/candles.service';

@Injectable()
export class SignalsService {
  private static readonly TIMEFRAME_MS: Record<string, number> = SIGNAL_TIMEFRAME_MS;

  private readonly logger = new Logger(SignalsService.name);
  private signals: StoredSignal[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly candlesService: CandlesService,
  ) { }

  /**
   * Map database row to StoredSignal format
   */
  private mapRowToStoredSignal(row: any): StoredSignal {
    return {
      id: row.id,
      strategyType: row.strategyType,
      symbol: row.symbol,
      timeframe: row.timeframe,
      signalType: row.signalType,
      price: Number(row.price),
      detectedAt: row.detectedAt,
      lifecycleStatus: row.lifecycleStatus,
      result: row.result,
      status: row.status,
      metadata: row.metadata,
      closedAt: row.closedAt,
      closedPrice: row.closedPrice ? Number(row.closedPrice) : undefined,
      pnlPercent: row.pnlPercent ? Number(row.pnlPercent) : undefined,
      outcome: row.outcome,
    };
  }

  /**
   * Normalize webhook body:
   * - Grno batch: { signals: [ { symbol, price, signals_by_timeframe }, ... ] } -> transform;
   * - Grno single: { symbol, price, signals_by_timeframe } (one coin per request) -> wrap and transform;
   * - else array or generic object -> [body].
   */
  normalizeWebhookBody(body: unknown): WebhookSignalInput[] {
    if (body != null && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (Array.isArray(b.signals)) {
        return transformGrnoPayloadToSignals(body);
      }
      // Grno wrapper: { event, timestamp, coin: { symbol, price, signals_by_timeframe } }
      const coin = b.coin;
      if (coin != null && typeof coin === 'object') {
        const coinKeys = Object.keys(coin as object).join(',');
        this.logger.log(`Webhook body.coin keys: ${coinKeys}`);
        const out = transformGrnoPayloadToSignals({ signals: [coin] });
        if (out.length > 0) return out;
      }
      // Single-coin format: one object with symbol + signals_by_timeframe or signalsByTimeframe (no top-level "signals" array)
      const byTf = b.signals_by_timeframe ?? b.signalsByTimeframe;
      if (typeof b.symbol === 'string' && byTf != null && typeof byTf === 'object') {
        return transformGrnoPayloadToSignals({ signals: [body] });
      }
    }
    if (Array.isArray(body)) return (body as WebhookSignalInput[]);
    if (body != null && typeof body === 'object') return [body as WebhookSignalInput];
    return [];
  }

  /**
   * Add signals. Accepted strategyTypes: SUPER_ENGULFING, RSIDIVERGENCE, RSI_DIVERGENCE, ICT_BIAS, CRT, 3OB, CISD.
   * If an item has signals_by_timeframe but no timeframe (raw Grno single-coin), expand it first.
   */
  async addSignals(items: Array<{ id?: string; strategyType?: string; symbol: string; timeframe?: string; signalType?: string; price: number; detectedAt?: string; closedAt?: string; lifecycleStatus?: string; result?: string; status?: string; metadata?: Record<string, unknown>; suppressTelegramAlert?: boolean; signals_by_timeframe?: Record<string, unknown> }>): Promise<number> {
    const allowedStrategies = new Set<string>(ALL_STRATEGY_TYPES);
    const allowedTf = new Set(ALL_TIMEFRAMES);
    const nowIso = new Date().toISOString();

    // Expand raw Grno objects (single-coin: have signals_by_timeframe/signalsByTimeframe but no timeframe/strategyType)
    const expanded: WebhookSignalInput[] = [];
    const first = items[0];
    const byTf = first && (first as any).signals_by_timeframe != null ? (first as any).signals_by_timeframe : first && (first as any).signalsByTimeframe;
    // this.logger.log(`addSignals: items=${items.length}, firstKeys=${first ? Object.keys(first).join(',') : 'none'}, hasByTf=${!!byTf}`);

    for (const s of items) {
      if (s.strategyType && allowedStrategies.has(s.strategyType) && s.timeframe && allowedTf.has(s.timeframe as any)) {
        expanded.push(s as WebhookSignalInput);
      } else if ((s as any).coin != null && typeof (s as any).coin === 'object') {
        const c = (s as any).coin;
        // this.logger.log(`addSignals unwrap coin keys: ${Object.keys(c).join(',')}`);
        expanded.push(...transformGrnoPayloadToSignals({ signals: [c] }));
      } else if (typeof (s as any).symbol === 'string') {
        const tf = (s as any).signals_by_timeframe ?? (s as any).signalsByTimeframe;
        if (tf != null && typeof tf === 'object') {
          expanded.push(...transformGrnoPayloadToSignals({ signals: [s] }));
        }
      }
    }
    // this.logger.log(`addSignals: expanded=${expanded.length}, toAdd will be computed`);

    const toAdd: StoredSignal[] = [];
    const suppressTelegramIds = new Set<string>();
    for (const s of expanded) {
      if (!s.strategyType || !allowedStrategies.has(s.strategyType) || !allowedTf.has(s.timeframe as any)) continue;
      const id = s.id?.trim() || `${s.strategyType}-${s.symbol}-${s.timeframe}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      if (s.suppressTelegramAlert) suppressTelegramIds.add(id);
      const closedAt =
        s.closedAt && typeof s.closedAt === 'string' ? s.closedAt : undefined;
      toAdd.push({
        id,
        strategyType: s.strategyType,
        symbol: String(s.symbol),
        timeframe: s.timeframe,
        signalType: s.signalType,
        price: Number(s.price),
        detectedAt: s.detectedAt && typeof s.detectedAt === 'string' ? s.detectedAt : nowIso,
        lifecycleStatus: s.lifecycleStatus && ['PENDING', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'ARCHIVED'].includes(s.lifecycleStatus) ? s.lifecycleStatus : 'ACTIVE',
        result: s.result && ['WIN', 'LOSS'].includes(s.result) ? s.result : undefined,
        status: s.status && ['ACTIVE', 'EXPIRED', 'FILLED', 'CLOSED', 'HIT_TP', 'HIT_SL'].includes(s.status) ? s.status : 'ACTIVE',
        metadata: s.metadata && typeof s.metadata === 'object' ? s.metadata : undefined,
        closedAt,
      });
    }

    // In-memory cache update
    const byId = new Map(this.signals.map((x) => [x.id, x]));
    for (const s of toAdd) {
      byId.set(s.id, s);
    }
    this.signals = Array.from(byId.values());
    if (this.signals.length > MAX_SIGNALS) {
      this.signals = this.signals.slice(-MAX_SIGNALS);
    }

    if (toAdd.length > 0) {
      try {
        const now = new Date();
        const createResult = await (this.prisma as any).superEngulfingSignal.createMany({
          data: toAdd.map((s) => {
            const meta = s.metadata as any;
            const isSuperEngulfing = s.strategyType === 'SUPER_ENGULFING';

            return {
              id: s.id,
              strategyType: s.strategyType,
              symbol: s.symbol,
              timeframe: s.timeframe,
              signalType: s.signalType,
              price: new Prisma.Decimal(s.price),
              detectedAt: new Date(s.detectedAt),
              lifecycleStatus: s.lifecycleStatus as any,
              result: s.result as any,
              status: s.status,
              closedAt: s.closedAt ? new Date(s.closedAt) : undefined,
              metadata: s.metadata as Prisma.JsonValue | undefined,
              // Legacy SE fields (mapped from metadata if present)
              direction: meta?.direction as string | undefined,
              se_entry_zone: meta?.se_entry_zone as number | undefined,
              se_sl: meta?.se_sl as number | undefined,
              se_tp1: meta?.se_tp1 as number | undefined,
              se_tp2: meta?.se_tp2 as number | undefined,
              se_current_sl: meta?.se_current_sl as number | undefined,
              // ICT Bias fields
              bias_direction: meta?.bias_direction as string | undefined,
              bias_level: meta?.bias_level as number | undefined,
              // SE Scanner v2 fields
              ...(isSuperEngulfing ? {
                state: 'live',
                type_v2: meta?.type_v2 as string | undefined,
                pattern_v2: meta?.pattern_v2 as string | undefined,
                direction_v2: meta?.direction_v2 as string | undefined,
                entry_price: meta?.entry_price as number | undefined,
                sl_price: meta?.sl_price as number | undefined,
                current_sl_price: meta?.current_sl_price as number | undefined,
                tp1_price: meta?.tp1_price as number | undefined,
                tp2_price: meta?.tp2_price as number | undefined,
                tp3_price: meta?.tp3_price as number | undefined,
                tp1_hit: false,
                tp2_hit: false,
                tp3_hit: false,
                result_v2: null,
                result_type: null,
                candle_count: 0,
                max_candles: meta?.max_candles as number | undefined,
                triggered_at: now,
                closed_at_v2: null,
                delete_at: null,
              } : {}),
            };
          }),
          skipDuplicates: true,
        });

        const actualInserted = createResult.count;

        if (actualInserted > 0) {
          for (const s of toAdd) {
            if (suppressTelegramIds.has(s.id)) continue;
            this.telegramService.sendSignalAlert(
              s.symbol,
              s.strategyType,
              s.timeframe,
              s.signalType,
              Number(s.price),
              s.metadata as Record<string, any> | undefined,
              s.id,
            ).catch(e => this.logger.error(`Failed to dispatch alert for ${s.id}: ${e.message}`));
          }
        }

        return actualInserted;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to persist signals: ${msg}`);
      }
    }

    return 0;
  }

  /**
   * Upsert a single signal by stable ID.
   * Used for state-like rows where a single id should be updated in place (ICT_BIAS uses addSignals; lifecycle closes rows).
   * Creates if not exists, updates if already exists — prevents signal accumulation.
   */
  async upsertSignal(signal: {
    id: string;
    strategyType: string;
    symbol: string;
    timeframe: string;
    signalType: string;
    price: number;
    detectedAt: string;
    lifecycleStatus?: string;
    metadata?: Record<string, any>;
  }): Promise<number> {
    const nowIso = new Date().toISOString();

    // Update in-memory cache
    const stored: StoredSignal = {
      id: signal.id,
      strategyType: signal.strategyType,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      signalType: signal.signalType,
      price: signal.price,
      detectedAt: signal.detectedAt || nowIso,
      lifecycleStatus: signal.lifecycleStatus || 'ACTIVE',
      status: 'ACTIVE',
      result: undefined,
      metadata: signal.metadata,
    };

    const idx = this.signals.findIndex(s => s.id === signal.id);
    if (idx >= 0) this.signals[idx] = stored;
    else this.signals.push(stored);

    // DB upsert
    try {
      const data = {
        strategyType: signal.strategyType,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        signalType: signal.signalType,
        price: new Prisma.Decimal(signal.price),
        detectedAt: new Date(signal.detectedAt || nowIso),
        lifecycleStatus: (signal.lifecycleStatus || 'ACTIVE') as any,
        status: 'ACTIVE',
        metadata: signal.metadata as Prisma.JsonValue | undefined,
        bias_direction: (signal.metadata as any)?.bias_direction as string | undefined,
        bias_level: (signal.metadata as any)?.bias_level as number | undefined,
      };

      await (this.prisma as any).superEngulfingSignal.upsert({
        where: { id: signal.id },
        update: data,
        create: { id: signal.id, ...data },
      });
      return 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to upsert signal ${signal.id}: ${msg}`);
      return 0;
    }
  }

  /**
   * Archive old signals: for each strategy+symbol+timeframe combo,
   * only keep the LATEST signal — archive ALL older ones (regardless of status).
   * Also restores the latest signal to ACTIVE if it was COMPLETED/EXPIRED.
   * Called after saving new signals to prevent accumulation.
   */
  async archiveOldSignals(strategyType: string, symbol: string, timeframe: string): Promise<number> {
    // SE v2 SPEC: SE signals are NEVER archived. They are hard-deleted after 48h by lifecycle service.
    if (strategyType === 'SUPER_ENGULFING') {
      return 0;
    }
    // RSI uses closeStaleRsiSignals per scan — multiple concurrent rows per symbol+TF are allowed.
    if (strategyType === 'RSI_DIVERGENCE' || strategyType === 'RSIDIVERGENCE') {
      return 0;
    }
    // ICT_BIAS: lifecycle validates next candle and closes; deleteStaleCompletedGlobal deletes old COMPLETED. No archive/restore.
    // NEVER restore COMPLETED ICT_BIAS to ACTIVE — that would break the lifecycle pipeline.
    if (strategyType === 'ICT_BIAS') {
      return 0;
    }
    // 3OB: lifecycle closes rows; do not restore COMPLETED or bulk-delete via archive.
    if (strategyType === '3OB') {
      return 0;
    }
    // CRT: keep one latest row per symbol+timeframe, but never resurrect COMPLETED/EXPIRED — lifecycle owns outcomes.
    if (strategyType === 'CRT') {
      try {
        const latest = await (this.prisma as any).superEngulfingSignal.findFirst({
          where: { strategyType, symbol, timeframe },
          orderBy: { detectedAt: 'desc' },
          select: { id: true },
        });
        if (!latest) return 0;
        const result = await (this.prisma as any).superEngulfingSignal.deleteMany({
          where: {
            strategyType,
            symbol,
            timeframe,
            id: { not: latest.id },
          },
        });
        if (result.count > 0) {
          this.signals = this.signals.filter(
            (s) =>
              !(
                s.strategyType === strategyType &&
                s.symbol === symbol &&
                s.timeframe === timeframe &&
                s.id !== latest.id
              ),
          );
        }
        return result.count;
      } catch (err) {
        this.logger.error(`archiveOldSignals failed for ${strategyType}-${symbol}-${timeframe}: ${err}`);
        return 0;
      }
    }
    try {
      // Find the latest signal for this combo (full record to check status)
      const latest = await (this.prisma as any).superEngulfingSignal.findFirst({
        where: { strategyType, symbol, timeframe },
        orderBy: { detectedAt: 'desc' },
        select: { id: true, lifecycleStatus: true },
      });

      if (!latest) return 0;

      // If the latest signal is COMPLETED or EXPIRED, restore it to ACTIVE
      // so it shows up as a live signal in monitors
      if (latest.lifecycleStatus === 'COMPLETED' || latest.lifecycleStatus === 'EXPIRED') {
        await (this.prisma as any).superEngulfingSignal.update({
          where: { id: latest.id },
          data: { lifecycleStatus: 'ACTIVE', status: 'ACTIVE' },
        });
        // Update in-memory cache too
        const cached = this.signals.find(s => s.id === latest.id);
        if (cached) {
          cached.lifecycleStatus = 'ACTIVE';
          cached.status = 'ACTIVE';
        }
      }

      // Delete everything else for this combo (ALL older signals)
      const result = await (this.prisma as any).superEngulfingSignal.deleteMany({
        where: {
          strategyType,
          symbol,
          timeframe,
          id: { not: latest.id },
        },
      });

      if (result.count > 0) {
        // Also remove from in-memory cache
        this.signals = this.signals.filter(s =>
          !(s.strategyType === strategyType && s.symbol === symbol && s.timeframe === timeframe && s.id !== latest.id)
        );
      }

      return result.count;
    } catch (err) {
      this.logger.error(`archiveOldSignals failed for ${strategyType}-${symbol}-${timeframe}: ${err}`);
      return 0;
    }
  }

  /**
   * RSI divergence lifecycle per symbol+timeframe:
   * 1) COMPLETED if detectedAt is older than 15 candles of this timeframe.
   * 2) If this scan returned at least one detected divergence id: COMPLETED for PENDING/ACTIVE rows whose id
   *    is not in the expanded confirmed set (scanner still sees a different pivot / type — drop stale rows).
   *    If the detector returned **no** signals for this pass, we do **not** bulk-close everyone: empty output is
   *    common while pivots repaint; rely on (1) for expiry. (Avoids wiping hundreds of pairs every cycle.)
   * 3) Hard-delete COMPLETED rows whose closedAt is older than 24h.
   */
  async closeStaleRsiSignals(symbol: string, timeframe: string, currentActiveIds: string[]): Promise<void> {
    try {
      const now = new Date();
      const candleMs = SignalsService.TIMEFRAME_MS[timeframe] ?? 3600000;
      const expiryThreshold = new Date(now.getTime() - candleMs * RSI_STALE_MAX_CANDLES);
      const strategyIn = [...RSI_DIVERGENCE_STRATEGY_TYPES];

      await (this.prisma as any).superEngulfingSignal.updateMany({
        where: {
          strategyType: { in: strategyIn },
          symbol,
          timeframe,
          lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
          detectedAt: { lt: expiryThreshold },
        },
        data: { lifecycleStatus: 'COMPLETED', status: 'CLOSED', closedAt: now },
      });

      const expandedConfirmed = expandConfirmedRsiDivergenceIds(currentActiveIds);
      if (expandedConfirmed.length > 0) {
        await (this.prisma as any).superEngulfingSignal.updateMany({
          where: {
            strategyType: { in: strategyIn },
            symbol,
            timeframe,
            lifecycleStatus: { in: ['PENDING', 'ACTIVE'] },
            id: { notIn: expandedConfirmed },
          },
          data: { lifecycleStatus: 'COMPLETED', status: 'CLOSED', closedAt: now },
        });
      }

      await (this.prisma as any).superEngulfingSignal.deleteMany({
        where: {
          strategyType: { in: strategyIn },
          symbol,
          timeframe,
          lifecycleStatus: 'COMPLETED',
          closedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });
    } catch (err) {
      this.logger.error(`closeStaleRsiSignals failed for ${symbol}-${timeframe}`, err);
    }
  }

  /** Distinct symbols that have at least one row for strategy+timeframe (e.g. live-bias symbol list). */
  async getDistinctSymbolsByStrategy(strategyType: string, timeframe: string): Promise<string[]> {
    const rows = await (this.prisma as any).superEngulfingSignal.findMany({
      where: { strategyType, timeframe },
      select: { symbol: true },
      distinct: ['symbol'],
    });
    return rows.map((r: { symbol: string }) => r.symbol as string);
  }

  async archiveAllStaleSignals(): Promise<number> {
    try {
      this.logger.log('Starting bulk archive cleanup...');

      // Use Prisma groupBy 
      const combos = await (this.prisma as any).superEngulfingSignal.groupBy({
        by: ['strategyType', 'symbol', 'timeframe'],
        where: {
          // SE v2 SPEC: Multiple SE signals per symbol+timeframe are allowed.
          // Do NOT touch SE signals here — they use state='live'/'closed' + hard delete after 48h.
          strategyType: { not: 'SUPER_ENGULFING' },
        },
        _count: true,
      });

      this.logger.log(`Found ${combos.length} unique strategy+symbol+timeframe combos to check`);

      let totalDeleted = 0;
      const CHUNK_SIZE = 20;
      for (let i = 0; i < combos.length; i += CHUNK_SIZE) {
        const chunk = combos.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
          chunk.map((c) => this.archiveOldSignals(c.strategyType, c.symbol, c.timeframe))
        );
        totalDeleted += results.reduce((acc, count) => acc + count, 0);
      }

      this.logger.log(`Bulk cleanup completed: ${totalDeleted} stale signals deleted out of ${combos.length} combos`);
      return totalDeleted;
    } catch (err) {
      this.logger.error(`archiveAllStaleSignals failed: ${err}`);
      return 0;
    }
  }

  /**
   * Update the status and outcome of an existing signal.
   * Called by the Position Tracker when TP/SL/Expiry is hit.
   */
  async updateSignalStatus(update: {
    id: string;
    status: string;
    outcome: string;
    closedPrice: number;
    closedAt: string;
    pnlPercent: number;
  }) {
    try {
      // 1. Update DB
      await (this.prisma as any).superEngulfingSignal.update({
        where: { id: update.id },
        data: {
          status: update.status,
          outcome: update.outcome,
          closedPrice: new Prisma.Decimal(update.closedPrice),
          closedAt: new Date(update.closedAt),
          pnlPercent: update.pnlPercent,
        },
      });

      // 2. Update in-memory cache
      const cachedSignal = this.signals.find(s => s.id === update.id);
      if (cachedSignal) {
        cachedSignal.lifecycleStatus = update.status as any; // roughly mapping to new field just to clear TS error
        // cachedSignal.result = ... left out for now
        cachedSignal.status = update.status;
        cachedSignal.outcome = update.outcome;
        cachedSignal.closedPrice = update.closedPrice;
        cachedSignal.closedAt = update.closedAt;
        cachedSignal.pnlPercent = update.pnlPercent;
      }

      this.logger.log(`Updated signal ${update.id} to ${update.status} (PnL: ${update.pnlPercent}%)`);
    } catch (err) {
      this.logger.error(`Failed to update signal ${update.id}: ${err.message}`);
    }
  }

  /**
   * Get stored signals.
   */
  async getSignals(strategyType?: string, limit?: number, minVolume?: number): Promise<StoredSignal[]> {
    try {
      const takeCount = minVolume ? 5000 : (limit ? Math.min(limit, MAX_SIGNALS) : MAX_SIGNALS);
      const rows = await (this.prisma as any).superEngulfingSignal.findMany({
        where: strategyType ? { strategyType } : undefined,
        orderBy: { detectedAt: 'desc' },
        take: takeCount,
      });

      let processedRows = rows;

      if (minVolume) {
        const volumes = await this.candlesService.get24hVolumes();
        processedRows = processedRows.filter((r) => {
          const vol = volumes.get(r.symbol) || 0;
          return vol >= minVolume;
        });
      }

      if (strategyType === 'ICT_BIAS') {
        const live = processedRows.filter(
          (r) => r.lifecycleStatus === 'PENDING' || r.lifecycleStatus === 'ACTIVE',
        );
        const closed = processedRows.filter(
          (r) => r.lifecycleStatus !== 'PENDING' && r.lifecycleStatus !== 'ACTIVE',
        );
        processedRows = [...live, ...closed];
      }

      if (limit && processedRows.length > limit) {
        processedRows = processedRows.slice(0, limit);
      }

      return processedRows.map((r) => {
        const isSuperEngulfing = r.strategyType === 'SUPER_ENGULFING';

        return {
          id: r.id,
          strategyType: r.strategyType,
          symbol: r.symbol,
          timeframe: r.timeframe,
          signalType: r.signalType,
          price: Number(r.price),
          detectedAt: r.detectedAt.toISOString(),
          lifecycleStatus: r.lifecycleStatus,
          result: r.result ?? undefined,
          status: r.status,
          metadata: r.metadata ?? undefined,
          closedAt: r.closedAt ? r.closedAt.toISOString() : undefined,
          closedPrice: r.closedPrice ? Number(r.closedPrice) : undefined,
          pnlPercent: r.pnlPercent ?? undefined,
          outcome: r.outcome ?? undefined,
          // Legacy SE fields
          direction: r.direction ?? undefined,
          se_entry_zone: r.se_entry_zone ?? undefined,
          se_sl: r.se_sl ?? undefined,
          se_tp1: r.se_tp1 ?? undefined,
          se_tp2: r.se_tp2 ?? undefined,
          se_current_sl: r.se_current_sl ?? undefined,
          se_r_ratio_hit: r.se_r_ratio_hit ?? undefined,
          se_close_price: r.se_close_price ?? undefined,
          se_close_reason: r.se_close_reason ?? undefined,
          candles_tracked: r.candles_tracked ?? undefined,
          max_candles: r.max_candles ?? undefined,
          // ============================================
          // SE Scanner v2 fields (per new specification)
          // ============================================
          ...(isSuperEngulfing ? {
            state: r.state ?? undefined,
            type_v2: r.type_v2 ?? undefined,
            pattern_v2: r.pattern_v2 ?? undefined,
            direction_v2: r.direction_v2 ?? undefined,
            entry_price: r.entry_price ?? undefined,
            sl_price: r.sl_price ?? undefined,
            current_sl_price: r.current_sl_price ?? undefined,
            tp1_price: r.tp1_price ?? undefined,
            tp2_price: r.tp2_price ?? undefined,
            tp3_price: r.tp3_price ?? undefined,
            tp1_hit: r.tp1_hit ?? undefined,
            tp2_hit: r.tp2_hit ?? undefined,
            tp3_hit: r.tp3_hit ?? undefined,
            result_v2: r.result_v2 ?? undefined,
            result_type: r.result_type ?? undefined,
            close_price: r.close_price ?? undefined,
            candle_count: r.candle_count ?? undefined,
            triggered_at: r.triggered_at ? r.triggered_at.toISOString() : undefined,
            closed_at_v2: r.closed_at_v2 ? r.closed_at_v2.toISOString() : undefined,
            delete_at: r.delete_at ? r.delete_at.toISOString() : undefined,
          } : {}),
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to load SuperEngulfing signals from DB: ${msg}`);
      // Fallback to in-memory cache
      let list = this.signals;
      if (strategyType) {
        list = list.filter((s) => s.strategyType === strategyType);
      }
      return [...list];
    }
  }

  /**
   * Get a single signal by its ID.
   */
  async getSignalById(id: string): Promise<StoredSignal | null> {
    try {
      const row = await (this.prisma as any).superEngulfingSignal.findUnique({
        where: { id },
      });
      if (!row) return null;
      return {
        id: row.id,
        strategyType: row.strategyType,
        symbol: row.symbol,
        timeframe: row.timeframe,
        signalType: row.signalType,
        price: Number(row.price),
        detectedAt: row.detectedAt.toISOString(),
        status: row.status,
        metadata: row.metadata ?? undefined,
        closedAt: row.closedAt ? row.closedAt.toISOString() : undefined,
        closedPrice: row.closedPrice ? Number(row.closedPrice) : undefined,
        pnlPercent: row.pnlPercent ?? undefined,
        outcome: row.outcome ?? undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to load signal by ID ${id}: ${msg}`);
      // Fallback to in-memory cache
      return this.signals.find((s) => s.id === id) ?? null;
    }
  }

  async getSignalStats(strategyType?: string): Promise<{
    total: number;
    active: number;
    won: number;
    lost: number;
    expired: number;
    winRate: number;
    avgWinPnl: number;
    avgLossPnl: number;
    // New lifecycle stats
    live: number;
    closedSignals: number;
    archived: number;
  }> {
    try {
      const where = strategyType ? { strategyType } : undefined;
      const rows = await (this.prisma as any).superEngulfingSignal.findMany({ where });

      const isSuperEngulfing = strategyType === 'SUPER_ENGULFING';

      const total = rows.length;

      // For SE v2, use state field; for others, use legacy status
      let active: number;
      let won: number;
      let lost: number;
      let expired: number;
      let live: number;
      let closedSignals: number;
      let archived: number;

      if (isSuperEngulfing) {
        // SE Scanner v2: Use state and result_v2 fields
        // SPEC: No archive state for SE - only "live" and "closed"
        live = rows.filter(r => r.state === 'live').length;
        closedSignals = rows.filter(r => r.state === 'closed').length;
        archived = 0; // SE v2 has no archive

        active = live; // For backward compat
        won = rows.filter(r => r.result_v2 === 'won' || r.result === 'WIN').length;
        lost = rows.filter(r => r.result_v2 === 'lost' || r.result === 'LOSS').length;
        expired = rows.filter(r => r.result_type === 'candle_expiry').length;
      } else {
        // Legacy: Use old lifecycle fields
        active = rows.filter((r) => r.status === 'ACTIVE').length;
        won = rows.filter((r) => r.status === 'HIT_TP' || r.outcome === 'HIT_TP' || r.result === 'WIN').length;
        lost = rows.filter((r) => r.status === 'HIT_SL' || r.outcome === 'HIT_SL' || r.result === 'LOSS').length;
        expired = rows.filter((r) => r.status === 'EXPIRED' || r.outcome === 'EXPIRED' || r.lifecycleStatus === 'EXPIRED').length;

        live = rows.filter(r => r.lifecycleStatus === 'PENDING' || r.lifecycleStatus === 'ACTIVE' || (!r.lifecycleStatus && r.status === 'ACTIVE')).length;
        closedSignals = rows.filter(r => r.lifecycleStatus === 'COMPLETED' || r.lifecycleStatus === 'EXPIRED' || (!r.lifecycleStatus && (r.status === 'HIT_TP' || r.status === 'HIT_SL' || r.status === 'EXPIRED' || r.status === 'CLOSED'))).length;
        archived = rows.filter(r => r.lifecycleStatus === 'ARCHIVED').length;
      }

      // PNL stats - works for both SE v2 and legacy
      const winPnls = rows.filter((r) => (r.result_v2 === 'won' || r.outcome === 'HIT_TP' || r.result === 'WIN') && r.pnlPercent != null).map((r) => r.pnlPercent);
      const lossPnls = rows.filter((r) => (r.result_v2 === 'lost' || r.outcome === 'HIT_SL' || r.result === 'LOSS') && r.pnlPercent != null).map((r) => r.pnlPercent);

      const closed = won + lost;
      const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
      const avgWinPnl = winPnls.length > 0
        ? Math.round((winPnls.reduce((a, b) => a + b, 0) / winPnls.length) * 100) / 100
        : 0;
      const avgLossPnl = lossPnls.length > 0
        ? Math.round((lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length) * 100) / 100
        : 0;

      return { total, active, won, lost, expired, winRate, avgWinPnl, avgLossPnl, live, closedSignals, archived };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to get signal stats: ${msg}`);
      return { total: 0, active: 0, won: 0, lost: 0, expired: 0, winRate: 0, avgWinPnl: 0, avgLossPnl: 0, live: 0, closedSignals: 0, archived: 0 };
    }
  }

  /**
   * Get daily recap data for a specific date
   */
  async getDailyRecap(date: string): Promise<{
    date: string;
    totalSignals: number;
    signalsByStrategy: Record<string, number>;
    winLossStats: { wins: number; losses: number; winRate: number };
    topSignals: StoredSignal[];
    targetAchievements: { tp1: { count: number; percentage: number }; tp2: { count: number; percentage: number }; tp3: { count: number; percentage: number } };
  }> {
    try {
      const targetDate = new Date(date);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const rows = await (this.prisma as any).superEngulfingSignal.findMany({
        where: {
          detectedAt: {
            gte: targetDate.toISOString(),
            lt: nextDate.toISOString(),
          },
        },
        orderBy: [{ detectedAt: 'desc' }],
      });

      // Count signals by strategy
      const signalsByStrategy: Record<string, number> = {
        SUPER_ENGULFING: 0,
        ICT_BIAS: 0,
        RSI_DIVERGENCE: 0,
        RSIDIVERGENCE: 0,
      };
      
      rows.forEach(row => {
        if (signalsByStrategy.hasOwnProperty(row.strategyType)) {
          signalsByStrategy[row.strategyType]++;
        }
      });

      // Calculate win/loss
      const wins = rows.filter(r => r.result_v2 === 'won' || r.result === 'WIN' || r.outcome === 'HIT_TP').length;
      const losses = rows.filter(r => r.result_v2 === 'lost' || r.result === 'LOSS' || r.outcome === 'HIT_SL').length;
      const winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

      // Get top signals by PnL
      const topSignals = rows
        .filter(r => r.pnlPercent != null)
        .sort((a, b) => (b.pnlPercent || 0) - (a.pnlPercent || 0))
        .slice(0, 5)
        .map(r => this.mapRowToStoredSignal(r));

      // Calculate target achievements for Super Engulfing signals
      const seSignals = rows.filter(r => r.strategyType === 'SUPER_ENGULFING');
      const totalSeSignals = seSignals.length;
      const tp1Hits = seSignals.filter(r => r.tp1_hit === true).length;
      const tp2Hits = seSignals.filter(r => r.tp2_hit === true).length;
      const tp3Hits = seSignals.filter(r => r.tp3_hit === true).length;

      return {
        date,
        totalSignals: rows.length,
        signalsByStrategy,
        winLossStats: { wins, losses, winRate },
        topSignals,
        targetAchievements: {
          tp1: {
            count: tp1Hits,
            percentage: totalSeSignals > 0 ? Math.round((tp1Hits / totalSeSignals) * 100) : 0,
          },
          tp2: {
            count: tp2Hits,
            percentage: totalSeSignals > 0 ? Math.round((tp2Hits / totalSeSignals) * 100) : 0,
          },
          tp3: {
            count: tp3Hits,
            percentage: totalSeSignals > 0 ? Math.round((tp3Hits / totalSeSignals) * 100) : 0,
          },
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to get daily recap for ${date}: ${msg}`);
      return {
        date,
        totalSignals: 0,
        signalsByStrategy: { SUPER_ENGULFING: 0, ICT_BIAS: 0, RSI_DIVERGENCE: 0, RSIDIVERGENCE: 0 },
        winLossStats: { wins: 0, losses: 0, winRate: 0 },
        topSignals: [],
        targetAchievements: { tp1: { count: 0, percentage: 0 }, tp2: { count: 0, percentage: 0 }, tp3: { count: 0, percentage: 0 } },
      };
    }
  }

  /**
   * Get market overview data for a specific date
   */
  async getMarketOverview(date: string): Promise<{
    topSymbols: { symbol: string; signalCount: number; priceChange: number; trend: 'bullish' | 'bearish' | 'ranging' }[];
    marketTrends: { bullish: number; bearish: number; ranging: number };
    volatility: { symbol: string; volatility: number; priceChange: number }[];
    notableMovements: { symbol: string; priceChange: number; volume: number }[];
  }> {
    try {
      const targetDate = new Date(date);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const rows = await (this.prisma as any).superEngulfingSignal.findMany({
        where: {
          detectedAt: {
            gte: targetDate.toISOString(),
            lt: nextDate.toISOString(),
          },
        },
      });

      // Count signals by symbol
      const symbolCounts: Record<string, number> = {};
      const symbolSignals: Record<string, any[]> = {};
      
      rows.forEach(row => {
        const symbol = row.symbol;
        symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
        if (!symbolSignals[symbol]) symbolSignals[symbol] = [];
        symbolSignals[symbol].push(row);
      });

      // Get top 10 symbols by signal count
      const topSymbols = Object.entries(symbolCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([symbol, count]) => {
          const signals = symbolSignals[symbol];
          const bullishSignals = signals.filter(s => s.signalType === 'BUY' || s.direction_v2 === 'bullish').length;
          const bearishSignals = signals.filter(s => s.signalType === 'SELL' || s.direction_v2 === 'bearish').length;
          
          let trend: 'bullish' | 'bearish' | 'ranging' = 'ranging';
          if (bullishSignals > bearishSignals * 1.5) trend = 'bullish';
          else if (bearishSignals > bullishSignals * 1.5) trend = 'bearish';

          return {
            symbol,
            signalCount: count,
            priceChange: 0, // Will be calculated later with market data
            trend,
          };
        });

      // Calculate market trends
      const totalBullish = rows.filter(r => r.signalType === 'BUY' || r.direction_v2 === 'bullish').length;
      const totalBearish = rows.filter(r => r.signalType === 'SELL' || r.direction_v2 === 'bearish').length;
      const totalSignals = rows.length;
      const ranging = totalSignals - totalBullish - totalBearish;

      const marketTrends = {
        bullish: totalSignals > 0 ? Math.round((totalBullish / totalSignals) * 100) : 0,
        bearish: totalSignals > 0 ? Math.round((totalBearish / totalSignals) * 100) : 0,
        ranging: totalSignals > 0 ? Math.round((ranging / totalSignals) * 100) : 0,
      };

      // For volatility and notable movements, we'll return empty arrays for now
      // This will be implemented with Binance API integration
      return {
        topSymbols,
        marketTrends,
        volatility: [],
        notableMovements: [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to get market overview for ${date}: ${msg}`);
      return {
        topSymbols: [],
        marketTrends: { bullish: 0, bearish: 0, ranging: 0 },
        volatility: [],
        notableMovements: [],
      };
    }
  }
}
