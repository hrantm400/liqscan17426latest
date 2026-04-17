# ICT Bias

## `detectICTBias`
**File:** [`backend/src/signals/indicators/ict-bias.detect.ts`](../../../../backend/src/signals/indicators/ict-bias.detect.ts)  

**Purpose:** Classify bias (bullish/bearish/ranging) from swing structure; used by HTTP `POST /signals/ict-bias` and scanner.

**Barrel:** re-exported from [`indicators/index.ts`](../../../../backend/src/signals/indicators/index.ts).

---

## `IctBiasScanner`
**File:** [`backend/src/signals/scanners/ict-bias.scanner.ts`](../../../../backend/src/signals/scanners/ict-bias.scanner.ts):10+  

### `scanFromCandles`
**Purpose:** `detectICTBias`; skip `RANGING`; map to `ICT_BIAS` signal with `bias_direction`, `bias_level` columns; `addSignals`.

### `computeLiveBias`
**Purpose:** (see file) Aggregates bias across symbols for a timeframe — used by `ScannerService.getLiveBias` with 60s cache.

### `scan`
**Purpose:** Uses WS or REST candles per implementation in file remainder.

---

## Lifecycle
**File:** [`lifecycle.service.ts`](../../../../backend/src/signals/lifecycle.service.ts) — validates bias on subsequent candles; `ICT_BIAS` config in `STRATEGY_CONFIG`.
