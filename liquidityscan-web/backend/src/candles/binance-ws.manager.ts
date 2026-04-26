import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as WebSocket from 'ws';
import { CandlesService } from './candles.service';
import { CandleFetchJob } from './candle-fetch.job';
import { CandleSnapshotService } from './candle-snapshot.service';
import type { CandleData } from '../signals/indicators';

const WS_BASE = 'wss://fstream.binance.com/ws';
const MAX_STREAMS_PER_CONN = 200;
const SUBSCRIBE_BATCH = 200;
// Phase 7.3 — 15m/5m streams added. With ~600 USDT-perp symbols this
// takes us from 4N=2400 to 6N=3600 streams, i.e. 12→18 WS connections
// at 200 streams/conn. Binance Futures docs document 200 streams/conn
// but publish no explicit connection cap; the reconnect/backoff path
// below handles any rate-limit edge case gracefully.
const INTERVALS = ['1h', '4h', '1d', '1w', '15m', '5m'];
/**
 * The lower TF streams produce far more candles per calendar window —
 * 500 holds ~41 h of 5m candles, which is enough scan-window headroom
 * for sub-hour lookbacks without ballooning memory (symbol count ×
 * 6 TFs × 500 candles ≈ 1.8M data points in worst case, still <500 MB).
 */
const CANDLE_HISTORY_LIMIT = 500;
const PING_INTERVAL_MS = 3 * 60 * 1000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const DB_FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const SNAPSHOT_FRESH_MS = 60 * 60 * 1000;

/**
 * Phase 7.3 — sub-hour event sink. Consumers (currently only
 * SubHourScannerDispatcher) register a listener that fires every time a
 * 15m or 5m kline closes (k.x === true). Higher TFs still flow through
 * the in-memory store + hourly cron, untouched.
 */
export type SubHourCloseListener = (evt: {
    symbol: string;
    interval: '15m' | '5m';
    candle: CandleData;
}) => void;

function storeKey(symbol: string, interval: string): string {
  return `${symbol.toUpperCase()}:${interval}`;
}

interface WsConn {
  streams: string[];
  ws: WebSocket | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  reconnectAttempts: number;
  closed: boolean;
}

@Injectable()
export class BinanceWsManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceWsManager.name);
  private readonly enabled: boolean;

  private store = new Map<string, CandleData[]>();
  private dirtyKeys = new Set<string>();
  private connections: WsConn[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private symbols: string[] = [];
  private ready = false;
  private destroying = false;
  private subHourListeners = new Set<SubHourCloseListener>();
  private readyResolver: (() => void) | null = null;
  private readyPromise: Promise<void> = new Promise<void>((resolve) => {
    this.readyResolver = resolve;
  });

  constructor(
    private readonly candlesService: CandlesService,
    private readonly candleFetchJob: CandleFetchJob,
    private readonly candleSnapshotService: CandleSnapshotService,
  ) {
    const env = process.env.BINANCE_WS_ENABLED;
    this.enabled = env === undefined || env === '' || !['0', 'false', 'no', 'off', 'disabled'].includes(String(env).trim().toLowerCase());
  }

  /** Synchronous read from in-memory store. */
  getCandles(symbol: string, interval: string): CandleData[] {
    const arr = this.store.get(storeKey(symbol, interval));
    return arr ? [...arr] : [];
  }

  getCandlesSlice(symbol: string, interval: string, limit: number): CandleData[] {
    const arr = this.store.get(storeKey(symbol, interval));
    if (!arr || arr.length === 0) return [];
    return arr.slice(-Math.max(1, Math.min(1000, limit)));
  }

  isReady(): boolean {
    return this.ready && this.enabled;
  }

  async waitUntilReady(timeoutMs: number): Promise<boolean> {
    if (this.ready && this.enabled) {
      return true;
    }
    if (!this.enabled) {
      return false;
    }
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<false>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(false), timeoutMs);
    });
    const result = await Promise.race([
      this.readyPromise.then(() => true as const),
      timeoutPromise,
    ]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    return result === true && this.enabled;
  }

  /**
   * Phase 7.3 — register a listener fired once per 15m/5m kline close.
   * Returns an unregister function. Listeners that throw are logged and
   * isolated so one bad consumer cannot stall the WS read loop.
   */
  onSubHourClose(listener: SubHourCloseListener): () => void {
    this.subHourListeners.add(listener);
    return () => {
      this.subHourListeners.delete(listener);
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('BinanceWsManager DISABLED (BINANCE_WS_ENABLED=false). Scanners will use REST fallback.');
      if (this.readyResolver) {
        this.readyResolver();
        this.readyResolver = null;
      }
      return;
    }

    try {
      this.symbols = await this.candlesService.fetchSymbols();
      this.logger.log(
        `BinanceWsManager: onModuleInit complete, ${this.symbols.length} symbols loaded. ` +
        `Backfill + WS connect running in background — app.listen() will not be blocked.`
      );
      void this.startupSequence();
    } catch (e) {
      this.logger.error(`BinanceWsManager onModuleInit failed (symbols fetch): ${(e as Error).message}`);
    }
  }

  private async startupSequence(): Promise<void> {
    const startMs = Date.now();
    try {
      await this.bootstrapStore();
      this.connectAll();

      this.flushTimer = setInterval(() => {
        this.flushDirtyToDB().catch((e) => this.logger.error(`Flush error: ${e.message}`));
      }, DB_FLUSH_INTERVAL_MS);

      this.ready = true;
      if (this.readyResolver) {
        this.readyResolver();
        this.readyResolver = null;
      }
      const elapsedSec = Math.round((Date.now() - startMs) / 1000);
      this.logger.log(`BinanceWsManager: ready (startup sequence took ${elapsedSec}s — WS connected, store populated)`);
    } catch (e) {
      const elapsedSec = Math.round((Date.now() - startMs) / 1000);
      this.logger.error(
        `BinanceWsManager: startup sequence FAILED after ${elapsedSec}s — ${(e as Error).message}. ` +
        `Scanners will use REST fallback via fetchAllCandles mutex.`
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroying = true;
    if (this.flushTimer) clearInterval(this.flushTimer);

    for (const conn of this.connections) {
      conn.closed = true;
      if (conn.pingTimer) clearInterval(conn.pingTimer);
      if (conn.ws) {
        try { conn.ws.close(); } catch { /* ignore */ }
      }
    }

    if (this.enabled && this.dirtyKeys.size > 0) {
      await this.flushDirtyToDB().catch(() => {});
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────

  private async bootstrapStore(): Promise<void> {
    // Phase 7.3 — sample every TF we stream, not just 4h. First boot
    // after the 15m/5m addition needs a REST fetch even when hourly
    // snapshots are still fresh, otherwise the sub-hour dispatcher
    // would start with empty in-memory candle stores and produce no
    // signals until the first scheduled REST refresh.
    const sampleSym = this.symbols[0] || 'BTCUSDT';
    const ages = await Promise.all(
      INTERVALS.map((tf) => this.candleSnapshotService.getSnapshotAge(sampleSym, tf)),
    );
    const isFresh = ages.every((a) => a !== null && a < SNAPSHOT_FRESH_MS);

    if (!isFresh) {
      this.logger.log('BinanceWsManager: snapshots stale or empty — running REST fetch first');
      await this.candleFetchJob.fetchAllCandles();
    }

    this.logger.log('BinanceWsManager: loading snapshots from DB into memory (batch read)...');
    const dbReadStartMs = Date.now();
    const allSnapshots = await this.candleSnapshotService.getAllSnapshots();
    const dbReadElapsedMs = Date.now() - dbReadStartMs;
    let loaded = 0;
    for (const sym of this.symbols) {
      for (const tf of INTERVALS) {
        const candles = allSnapshots.get(`${sym}:${tf}`) ?? [];
        if (candles.length > 0) {
          this.store.set(storeKey(sym, tf), candles.slice(-CANDLE_HISTORY_LIMIT));
          loaded++;
        }
      }
    }
    this.logger.log(
      `BinanceWsManager: loaded ${loaded} snapshot entries into memory (batch DB read took ${dbReadElapsedMs}ms)`
    );
  }

  // ── WebSocket connections ──────────────────────────────────

  private buildStreamGroups(): string[][] {
    const allStreams: string[] = [];
    for (const sym of this.symbols) {
      for (const tf of INTERVALS) {
        allStreams.push(`${sym.toLowerCase()}@kline_${tf}`);
      }
    }
    const groups: string[][] = [];
    for (let i = 0; i < allStreams.length; i += MAX_STREAMS_PER_CONN) {
      groups.push(allStreams.slice(i, i + MAX_STREAMS_PER_CONN));
    }
    return groups;
  }

  private connectAll(): void {
    const groups = this.buildStreamGroups();
    const totalStreams = this.symbols.length * INTERVALS.length;
    this.logger.log(`BinanceWsManager: opening ${groups.length} WS connection(s) for ${totalStreams} streams`);
    for (const streams of groups) {
      const conn: WsConn = { streams, ws: null, pingTimer: null, reconnectAttempts: 0, closed: false };
      this.connections.push(conn);
      this.openWs(conn);
    }
  }

  private openWs(conn: WsConn): void {
    if (conn.closed || this.destroying) return;

    const ws = new WebSocket(WS_BASE);
    conn.ws = ws;

    ws.on('open', () => {
      conn.reconnectAttempts = 0;
      this.logger.log(`BinanceWsManager: WS connected, subscribing to ${conn.streams.length} streams...`);
      this.sendSubscribe(conn);
      this.startPing(conn);
    });

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.k) {
          this.handleKline(msg.k);
        } else if (msg?.data?.k) {
          this.handleKline(msg.data.k);
        }
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => {
      this.clearPing(conn);
      if (!conn.closed && !this.destroying) this.scheduleReconnect(conn);
    });

    ws.on('error', (err: Error) => {
      this.logger.warn(`BinanceWsManager WS error: ${err.message}`);
    });
  }

  private sendSubscribe(conn: WsConn): void {
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;
    let id = 1;
    for (let i = 0; i < conn.streams.length; i += SUBSCRIBE_BATCH) {
      const batch = conn.streams.slice(i, i + SUBSCRIBE_BATCH);
      conn.ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: batch, id: id++ }));
    }
  }

  private startPing(conn: WsConn): void {
    this.clearPing(conn);
    conn.pingTimer = setInterval(() => {
      if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;

      let pongReceived = false;
      const onPong = () => { pongReceived = true; };
      conn.ws.once('pong', onPong);
      conn.ws.ping();

      setTimeout(() => {
        if (!pongReceived && conn.ws) {
          this.logger.warn('BinanceWsManager: pong timeout, forcing reconnect');
          conn.ws.removeListener('pong', onPong);
          try { conn.ws.terminate(); } catch { /* ignore */ }
        }
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private clearPing(conn: WsConn): void {
    if (conn.pingTimer) { clearInterval(conn.pingTimer); conn.pingTimer = null; }
  }

  private scheduleReconnect(conn: WsConn): void {
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, conn.reconnectAttempts));
    conn.reconnectAttempts++;
    this.logger.log(`BinanceWsManager: reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${conn.reconnectAttempts})`);
    setTimeout(() => this.openWs(conn), delay);
  }

  // ── Kline handler ──────────────────────────────────────────

  private handleKline(k: Record<string, unknown>): void {
    const symbol = String(k.s || '').toUpperCase();
    const interval = String(k.i || '');
    const openTime = Number(k.t);
    const open = parseFloat(String(k.o));
    const high = parseFloat(String(k.h));
    const low = parseFloat(String(k.l));
    const close = parseFloat(String(k.c));
    const volume = parseFloat(String(k.v));
    const isClosed = k.x === true;

    if (!symbol || !interval || !Number.isFinite(openTime)) return;

    const key = storeKey(symbol, interval);
    const candles = this.store.get(key);
    if (!candles || candles.length === 0) return;

    const last = candles[candles.length - 1];

    let appendedClose: CandleData | null = null;

    if (openTime === last.openTime) {
      last.high = Math.max(last.high, high);
      last.low = Math.min(last.low, low);
      last.close = close;
      last.volume = volume;
      this.dirtyKeys.add(key);
      // Binance emits one final tick per candle with x=true and openTime
      // unchanged from the live update stream — fire the sub-hour event
      // from this branch too so consumers see the authoritative close.
      if (isClosed && (interval === '15m' || interval === '5m')) {
        appendedClose = { ...last };
      }
    } else if (openTime > last.openTime) {
      const next: CandleData = { openTime, open, high, low, close, volume };
      if (isClosed) {
        candles.push(next);
        if (interval === '15m' || interval === '5m') appendedClose = next;
      } else {
        if (!Number.isFinite(last.close)) return;
        candles.push(next);
      }
      if (candles.length > CANDLE_HISTORY_LIMIT) candles.shift();
      this.dirtyKeys.add(key);
    }

    if (appendedClose && this.subHourListeners.size > 0) {
      this.dispatchSubHourClose(symbol, interval as '15m' | '5m', appendedClose);
    }
  }

  private dispatchSubHourClose(
    symbol: string,
    interval: '15m' | '5m',
    candle: CandleData,
  ): void {
    for (const listener of this.subHourListeners) {
      try {
        listener({ symbol, interval, candle });
      } catch (e) {
        this.logger.warn(
          `sub-hour listener threw for ${symbol}:${interval}: ${(e as Error).message}`,
        );
      }
    }
  }

  // ── DB flush ───────────────────────────────────────────────

  private async flushDirtyToDB(): Promise<void> {
    if (this.dirtyKeys.size === 0) return;

    const keys = [...this.dirtyKeys];
    this.dirtyKeys.clear();

    let flushed = 0;
    for (const key of keys) {
      const candles = this.store.get(key);
      if (!candles || candles.length === 0) continue;
      const [symbol, interval] = key.split(':');
      try {
        await this.candleSnapshotService.upsertSnapshot(symbol, interval, candles);
        flushed++;
      } catch (e) {
        this.logger.warn(`Flush failed for ${key}: ${(e as Error).message}`);
        this.dirtyKeys.add(key);
      }
    }

    if (flushed > 0) {
      this.logger.log(`BinanceWsManager: flushed ${flushed} dirty snapshots to DB`);
    }
  }
}
