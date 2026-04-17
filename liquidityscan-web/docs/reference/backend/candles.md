# Candles module

## `CandlesService`
**File:** [`backend/src/candles/candles.service.ts`](../../../backend/src/candles/candles.service.ts):9-114  

**Purpose:** Kline fetch with **per-interval TTL cache** and **in-flight request coalescing**; symbol list from provider; aggregate ticker price map; 24h volume map with 5-minute cache.

### `getKlines`
**Signature:** `async getKlines(symbol: string, interval: string, limit?: number): Promise<CandleDto[]>`  
**Purpose:** Normalize symbol; reject too-short symbols; clamp limit 1–1000; cache key `sym_interval_limit`; delegate to `BinanceProvider.getKlines`.

### `fetchSymbols`
**Purpose:** All USDT pairs from provider; fallback `['BTCUSDT','ETHUSDT']`.

### `getCurrentPrices`
**Purpose:** `provider.getCurrentPrices()` → `Map<symbol, price>` for lifecycle / PnL.

### `get24hVolumes`
**Purpose:** Cached 5m map for volume filters on signal lists.

---

## `BinanceWsManager`
**File:** [`backend/src/candles/binance-ws.manager.ts`](../../../backend/src/candles/binance-ws.manager.ts)  
**Purpose:** Multi-stream WebSocket to Binance; maintains in-memory latest klines for subscribed symbols; `isReady()` used by `ScannerService` to skip REST snapshot download.

---

## `CandleFetchJob`
**File:** [`backend/src/candles/candle-fetch.job.ts`](../../../backend/src/candles/candle-fetch.job.ts)  
**Purpose:** Batch REST download of klines into DB for all symbols/timeframes when WS not ready (`fetchAllCandles`).

---

## `CandleSnapshotService`
**File:** [`backend/src/candles/candle-snapshot.service.ts`](../../../backend/src/candles/candle-snapshot.service.ts)  
**Purpose:** Persist/read `CandleSnapshot` rows (JSON blobs).

---

## `CandlesController`
**File:** [`backend/src/candles/candles.controller.ts`](../../../backend/src/candles/candles.controller.ts)  
**Purpose:** HTTP API for frontend chart data — verify routes in source.
