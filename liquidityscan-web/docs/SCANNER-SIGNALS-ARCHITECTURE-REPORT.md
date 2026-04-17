# Scanner & Indicators Architecture — Reference Report

This document describes the **backend signal scanning stack** in `liquidityscan-web/backend/src/signals/`: what each file does, how data flows, and how the pieces relate. It is intended for code review, onboarding, and external auditors.

---

## 1. High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  ScannerService (orchestrator)                                   │
│  • Hourly full-market scan (chunked)                               │
│  • Live ICT bias cache (60s TTL)                                   │
└───────────────┬─────────────────────────────────────────────────┘
                │ injects
    ┌───────────┼───────────┬──────────────┐
    ▼           ▼           ▼              ▼
 SuperEngulfing  ICT Bias   RSI Div.      CRT
  Scanner      Scanner      Scanner     Scanner
    │           │           │              │
    └───────────┴───────────┴──────────────┘
                │ uses pure functions from
                ▼
        indicators/  (no DB, no HTTP — candles in → signals out)
```

**Design principles**

- **Indicators** (`indicators/`): pure TypeScript — same inputs always yield the same outputs. No NestJS, no Prisma.
- **Scanners** (`scanners/*.scanner.ts`): Nest injectable classes — fetch candles via `CandlesService`, call detectors, persist via `SignalsService`.
- **Orchestrator** (`scanner.service.ts`): scheduling, rate limits (chunks + delays), coordinates all strategy scanners.

---

## 2. Pure indicator layer (`signals/indicators/`)

| File | Purpose |
|------|---------|
| **`candle-types.ts`** | Shared TypeScript interfaces: `CandleData` (OHLCV), and result shapes for RSI divergence, Super Engulfing, ICT bias, CRT, plus `RSIDivergenceConfig`. |
| **`rsi-math.ts`** | **`calculateRSI(closes, length)`** — Wilder/RMA smoothing aligned with common charting platforms. Used by RSI divergence detection. |
| **`rsi-divergence.detect.ts`** | **`detectRSIDivergence(candles, config?)`** — Finds pivot highs/lows on RSI, compares to price pivots, emits regular/hidden bullish/bearish divergences for the recent window. |
| **`super-engulfing.detect.ts`** | **`calculateATR`**, **`detectSuperEngulfing(candles)`** — REV/RUN/Plus patterns on the **last closed** candle pair; computes SL/TP levels per internal spec. |
| **`ict-bias.detect.ts`** | **`detectICTBias(candles)`** — Compares prior close to older range; returns BULLISH / BEARISH / RANGING with direction hint. |
| **`crt.detect.ts`** | **`detectCRT(candles)`** — Candle Range Theory: liquidity sweep beyond previous candle’s range with body back inside; returns one signal or `null`. |
| **`index.ts`** | Barrel file: re-exports all public types and functions so consumers can `import { … } from '../indicators'` or from the compatibility shim. |

**Compatibility shim**

| File | Purpose |
|------|---------|
| **`signals/indicators.ts`** | Single line: `export * from './indicators/index'` — keeps legacy imports `from './indicators'` working without changing call sites across the codebase. |

---

## 3. Scanner integration layer

### 3.1 Helpers

| File | Purpose |
|------|---------|
| **`scanner-candles.helper.ts`** | **`getScannerCandles(candlesService, symbol, interval)`** — Fetches **120** klines and maps them to `CandleData` (enough history for RSI divergence and other strategies). |
| **`scanner-persistence.helper.ts`** | **`saveScannerSignal(signalsService, …)`** — Builds a pending signal row, calls `addSignals`, then **`archiveOldSignals`** for that strategy+symbol+timeframe (used e.g. by CRT). |

### 3.2 Strategy scanners (`signals/scanners/`)

Each class is **`@Injectable()`** and receives **`CandlesService`** + **`SignalsService`**.

| File | Class | What it does |
|------|--------|----------------|
| **`super-engulfing.scanner.ts`** | `SuperEngulfingScanner` | Gets candles, uses **closed** candles only (`slice(0,-1)`), runs `detectSuperEngulfing`, maps to DB payloads with SE v2/v3 metadata, **`addSignals`**. Multiple live rows per symbol+TF allowed; IDs include pattern + time. |
| **`ict-bias.scanner.ts`** | `IctBiasScanner` | **`scan`**: full candle array (forming candle kept) for `detectICTBias`; **`upsertSignal`** with stable id `ICT_BIAS-{symbol}-{tf}`. **`computeLiveBias`**: loads distinct ICT_BIAS symbols from DB for a timeframe, batches Binance klines (concurrency 10), runs `detectICTBias` per symbol — used by live-bias API (cache lives in `ScannerService`). |
| **`rsi-divergence.scanner.ts`** | `RsiDivergenceScanner` | Closed candles only; filters divergences whose pivot index is in the latest confirmable window; **`addSignals`** + **`archiveOldSignals`** for RSI strategy. |
| **`crt.scanner.ts`** | `CrtScanner` | Closed candles; **`saveScannerSignal`** with CRT metadata (sweep levels, etc.). |

### 3.3 SE runtime helper

| File | Purpose |
|------|---------|
| **`se-runtime.ts`** | **`getMaxCandlesForTimeframe(timeframe)`** — Max holding/validation window (in candles) stored in SE signal metadata. Used by `SuperEngulfingScanner` when building metadata. |

---

## 4. Orchestrator & HTTP API

| File | Purpose |
|------|---------|
| **`scanner.service.ts`** | **`ScannerService`**: `OnModuleInit` schedules **hourly** basic scan (top of hour) and startup archives; **`scanBasicStrategies`** chunks symbols with delay; **`scanSymbol`** runs SE → ICT → RSI → CRT timeframes in fixed order; **`getLiveBias`** wraps **`IctBiasScanner.computeLiveBias`** with **60s** in-memory cache; **`fetchSymbols`** delegates to data provider. |
| **`signals.controller.ts`** | HTTP: e.g. **`POST /signals/scan`** triggers `scanBasicStrategies`; **`POST /signals/ict-bias`** runs **`detectICTBias`** on posted candles (stateless); **`GET /signals/live-bias`** returns cached live bias map from `ScannerService`. |
| **`signals.module.ts`** | Registers `SignalsService`, all scanner classes, `ScannerService`, lifecycle/position services — **scanner classes must be listed before** `ScannerService` (Nest resolves constructor deps). |

---

## 5. Tests (regression)

| File | Purpose |
|------|---------|
| **`benchmark.spec.ts`** | Performance-style test: mocks klines + `addSignals`, runs **`SuperEngulfingScanner.scan`**, optionally mocks `./indicators` `detectSuperEngulfing`. |
| **`se-runtime.spec.ts`** | Unit tests for `getMaxCandlesForTimeframe`. |
| **`test_rsidivergence.spec.ts`** | Placeholder / lightweight test file (may be expanded). |

Run from backend: `npm test -- --testPathPattern=signals`

---

## 6. End-to-end data flow (one symbol, one timeframe)

1. **Orchestrator** calls e.g. `superEngulfingScanner.scan('BTCUSDT', '4h')`.
2. **Helper** loads 120 klines → `CandleData[]`.
3. **Detector** (`detectSuperEngulfing`) runs on the appropriate slice (closed vs open rules differ per strategy).
4. **SignalsService** persists rows (and may archive old rows depending on strategy).
5. **Frontend / monitors** read persisted signals via existing API (not duplicated in this bundle).

---

## 7. What this bundle is **not**

- It does **not** include **`signals.service.ts`** (large persistence, webhooks, in-memory cache) — only referenced.
- It does **not** include **`lifecycle.service.ts`**, **`position-tracker.service.ts`** — SE state machine and tracking are separate concerns.
- Prisma schema and migrations are outside this report; signal **shapes** are defined by code + DB together.

---

## 8. Zip bundle contents

The accompanying archive **`scanner-signals-bundle.zip`** includes:

- Entire **`signals/indicators/`** directory  
- **`signals/indicators.ts`**  
- Entire **`signals/scanners/`** directory  
- **`scanner-candles.helper.ts`**, **`scanner-persistence.helper.ts`**, **`scanner.service.ts`**  
- **`se-runtime.ts`**  
- **`signals.controller.ts`**, **`signals.module.ts`**  
- **`benchmark.spec.ts`**, **`se-runtime.spec.ts`**, **`test_rsidivergence.spec.ts`**  
- This report: **`SCANNER-SIGNALS-ARCHITECTURE-REPORT.md`**

---

*Generated as documentation for the LiquidityScan scanner/indicators module. Paths are relative to `liquidityscan-web/backend/src/signals/` unless noted.*
