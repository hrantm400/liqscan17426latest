import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_TIMEFRAMES, ALL_STRATEGY_TYPES } from './dto/webhook-signal.dto';

const MAX_SIGNALS = 5000;
const ALLOWED_TF = new Set<string>(ALL_TIMEFRAMES);

export type WebhookSignalInput = {
  id?: string;
  strategyType: string;
  symbol: string;
  timeframe: string;
  signalType: string;
  price: number;
  detectedAt?: string;
  lifecycleStatus?: string;
  result?: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

export class StoredSignal {
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

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);
  private signals: StoredSignal[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) { }

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
   * Add signals. Accepted strategyTypes: SUPER_ENGULFING, RSI_DIVERGENCE, ICT_BIAS.
   * If an item has signals_by_timeframe but no timeframe (raw Grno single-coin), expand it first.
   */
  async addSignals(items: Array<{ id?: string; strategyType?: string; symbol: string; timeframe?: string; signalType?: string; price: number; detectedAt?: string; lifecycleStatus?: string; result?: string; status?: string; metadata?: Record<string, unknown>; signals_by_timeframe?: Record<string, unknown> }>): Promise<number> {
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
    for (const s of expanded) {
      if (!s.strategyType || !allowedStrategies.has(s.strategyType) || !allowedTf.has(s.timeframe as any)) continue;
      const id = s.id?.trim() || `${s.strategyType}-${s.symbol}-${s.timeframe}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
        await (this.prisma as any).superEngulfingSignal.createMany({
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
              // ============================================
              // SE Scanner v2 fields (per new specification)
              // ============================================
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
                tp1_hit: false,
                tp2_hit: false,
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

        // Trigger Telegram Alerts
        for (const s of toAdd) {
          this.telegramService.sendSignalAlert(
            s.symbol,
            s.strategyType,
            s.timeframe,
            s.signalType,
            s.price,
            s.metadata as Record<string, any> | undefined
          ).catch(e => this.logger.error(`Failed to dispatch alert for ${s.id}: ${e.message}`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to persist signals: ${msg}`);
      }
    }

    return toAdd.length;
  }

  /**
   * Upsert a single signal by stable ID.
   * Used for "state" strategies (like ICT_BIAS) where only the latest signal per symbol+timeframe matters.
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

      // Archive everything else for this combo (ALL statuses except already ARCHIVED)
      const result = await (this.prisma as any).superEngulfingSignal.updateMany({
        where: {
          strategyType,
          symbol,
          timeframe,
          id: { not: latest.id },
          lifecycleStatus: { not: 'ARCHIVED' },
        },
        data: { lifecycleStatus: 'ARCHIVED', status: 'EXPIRED' },
      });

      if (result.count > 0) {
        // Also update in-memory cache
        for (const s of this.signals) {
          if (s.strategyType === strategyType && s.symbol === symbol && s.timeframe === timeframe && s.id !== latest.id) {
            if (s.lifecycleStatus !== 'ARCHIVED') {
              s.lifecycleStatus = 'ARCHIVED';
              s.status = 'EXPIRED';
            }
          }
        }
      }

      return result.count;
    } catch (err) {
      this.logger.error(`archiveOldSignals failed for ${strategyType}-${symbol}-${timeframe}: ${err}`);
      return 0;
    }
  }

  /**
   * One-time bulk cleanup: archive ALL stale signals across ALL strategies.
   * For each strategy+symbol+timeframe combo, only the latest stays ACTIVE.
   */
  async archiveAllStaleSignals(): Promise<number> {
    try {
      this.logger.log('Starting bulk archive cleanup...');

      // Use Prisma groupBy — include ALL statuses, not just ACTIVE/PENDING
      const combos = await (this.prisma as any).superEngulfingSignal.groupBy({
        by: ['strategyType', 'symbol', 'timeframe'],
        where: {
          lifecycleStatus: { not: 'ARCHIVED' },
        },
        _count: true,
      });

      this.logger.log(`Found ${combos.length} unique strategy+symbol+timeframe combos to check`);

      let totalArchived = 0;
      for (const c of combos) {
        const archived = await this.archiveOldSignals(c.strategyType, c.symbol, c.timeframe);
        totalArchived += archived;
      }

      this.logger.log(`Bulk archive completed: ${totalArchived} stale signals archived out of ${combos.length} combos`);
      return totalArchived;
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
  async getSignals(strategyType?: string): Promise<StoredSignal[]> {
    try {
      const rows = await (this.prisma as any).superEngulfingSignal.findMany({
        where: strategyType ? { strategyType } : undefined,
        orderBy: { detectedAt: 'desc' },
        take: MAX_SIGNALS,
      });
      return rows.map((r) => {
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
            tp1_hit: r.tp1_hit ?? undefined,
            tp2_hit: r.tp2_hit ?? undefined,
            result_v2: r.result_v2 ?? undefined,
            result_type: r.result_type ?? undefined,
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
}
