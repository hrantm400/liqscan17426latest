# Signals module — overview

**Module:** [`backend/src/signals/signals.module.ts`](../../../../backend/src/signals/signals.module.ts)  
**Imports:** `PrismaModule`, `CandlesModule`, `TelegramModule`, `AdminModule`, `AppConfigModule`  
**Exports:** `SignalsService` only (scanners used internally).

---

## `SignalsController`
**File:** [`backend/src/signals/signals.controller.ts`](../../../../backend/src/signals/signals.controller.ts):8-118  

| Method | Route | Auth / Notes |
|--------|-------|----------------|
| `runScan` | POST `signals/scan` | JWT; skipped if `MARKET_SCANNER_ENABLED=false` |
| `marketScannerStatus` | GET `signals/market-scanner-status` | **@Public** |
| `getIctBias` | POST `signals/ict-bias` | Body: candle array → `detectICTBias` |
| `getLiveBias` | GET `signals/live-bias?timeframe=` | JWT; `ScannerService.getLiveBias` |
| `getRsiConfig` / `setRsiConfig` | GET/POST `signals/rsi-config` | **AdminGuard** |
| `getStats` | GET `signals/stats` | Optional `strategyType` |
| `getDailyRecap` | GET `signals/daily-recap` | Optional `date` |
| `getMarketOverview` | GET `signals/market-overview` | Optional `date` |
| `getSignalById` | GET `signals/:id` | |
| `getSignals` | GET `signals` | Query: `strategyType`, `limit`, `minVolume` |

---

## `SignalsService`
**File:** [`backend/src/signals/signals.service.ts`](../../../../backend/src/signals/signals.service.ts)  

**Constants:** `RSI_STALE_MAX_CANDLES`, `SIGNAL_TIMEFRAME_MS`, `expandConfirmedRsiDivergenceIds`, `StoredSignal` class, `WebhookSignalInput` type.

### `normalizeWebhookBody`
**Purpose:** Accept Grno batch/single formats, arrays, or generic objects → `WebhookSignalInput[]`.

### `addSignals`
**Purpose:** Expand Grno payloads; validate strategy/timeframe; generate ids; merge in-memory cache; upsert Prisma `SuperEngulfingSignal`; optional Telegram; cap list size (`MAX_SIGNALS`).

### `upsertSignal`
**Purpose:** Single-row upsert path for lifecycle updates.

### `archiveOldSignals`
**Purpose:** Limit concurrent active rows per strategy+symbol+timeframe.

### `closeStaleRsiSignals`
**Purpose:** Close RSI rows no longer in current detector output (legacy id expansion).

### `getDistinctSymbolsByStrategy` / `archiveAllStaleSignals`
**Purpose:** Startup cleanup / batch maintenance.

### `updateSignalStatus`
**Purpose:** Partial updates for lifecycle (status, closedAt, PnL, etc.).

### `getSignals` / `getSignalById`
**Purpose:** Read API with optional volume filter (uses volumes from `CandlesService`).

### `getSignalStats` / `getDailyRecap` / `getMarketOverview`
**Purpose:** Analytics aggregations over stored signals.

---

## `ScannerService`
**File:** [`backend/src/signals/scanner.service.ts`](../../../../backend/src/signals/scanner.service.ts):31+  

**Purpose:** Orchestrates **hourly** full-market scan (top-of-hour aligned), optional **startup** stale archive, **live bias** cache (60s), **RSI runtime config** (mutable via API).

### `isMarketScannerEnabled`
**Purpose:** Reads `MARKET_SCANNER_ENABLED` env.

### `getLiveBias` / `getRsiConfig` / `setRsiConfig`
**Purpose:** Bias cache + admin-tunable RSI pivot parameters.

### `onModuleInit` / `onModuleDestroy`
**Purpose:** Schedule hourly scan; delayed `archiveAllStaleSignals`; clear timers.

### `fetchSymbols`
**Purpose:** Delegates to `CandlesService.fetchSymbols`.

### `scanBasicStrategies`
**Purpose:** If WS ready use memory; else run `CandleFetchJob`; chunk symbols; per symbol `scanSymbol` runs all scanners.

### `scanSymbol` (see file)
**Purpose:** Invokes `SuperEngulfingScanner`, `IctBiasScanner`, `RsiDivergenceScanner`, `CrtScanner`, `ThreeOBScanner`, `CisdScanner` per configured timeframes.

---

## `LifecycleService`
**File:** [`backend/src/signals/lifecycle.service.ts`](../../../../backend/src/signals/lifecycle.service.ts):49+  

**Purpose:** Periodic (5 min) evaluation of open signals: SE v2 TP/SL, ICT bias validation, CRT/3OB/CISD lifecycles, global stale delete; **SE hard-delete** job every 15 min for `delete_at` passed.

**Key private methods:** `deleteExpiredSeSignals`, `checkAllSignals`, `checkCrtLifecycle`, `check3OBLifecycle`, `checkCisdLifecycle`, `checkSuperEngulfingV2`, `deleteStaleCompletedGlobal`, etc.

---

## `SignalStateService` / `PositionTrackerService`
**Files:** [`signal-state.service.ts`](../../../../backend/src/signals/signal-state.service.ts), [`position-tracker.service.ts`](../../../../backend/src/signals/position-tracker.service.ts)  
**Purpose:** Shared state / position tracking for complex strategies — see files for public methods.

---

## Helpers

### `getScannerCandles`
**File:** [`backend/src/signals/scanner-candles.helper.ts`](../../../../backend/src/signals/scanner-candles.helper.ts):7-22  
**Purpose:** Map `CandlesService.getKlines` (limit 500) to `CandleData[]`.

### `saveScannerSignal`
**File:** [`backend/src/signals/scanner-persistence.helper.ts`](../../../../backend/src/signals/scanner-persistence.helper.ts):6-38  
**Purpose:** Build id `STRATEGY-symbol-timeframe-time`; `addSignals`; fire-and-forget `archiveOldSignals`.

---

## `indicators.ts` barrel
**File:** [`backend/src/signals/indicators.ts`](../../../../backend/src/signals/indicators.ts)  
**Purpose:** Re-exports from `indicators/*` for clean imports.
