# 3OB — Three Order Block detector

## `detect3OB`
**File:** [`backend/src/signals/indicators/3ob.detect.ts`](../../../../backend/src/signals/indicators/3ob.detect.ts)  

**Purpose:** Identify 3-candle order-block pattern; returns direction, price, candle OHLC metadata fields consumed by scanner.

---

## `ThreeOBScanner`
**File:** [`backend/src/signals/scanners/3ob.scanner.ts`](../../../../backend/src/signals/scanners/3ob.scanner.ts):9+  

### `scanFromCandles`
**Purpose:** Minimum 3 closed candles; build id `3OB-${symbol}-${timeframe}-${time}`; `addSignals` with strategy `3OB`.

### `scan`
**Purpose:** Standard `getScannerCandles` pipeline.

---

## Lifecycle
**File:** [`lifecycle.service.ts`](../../../../backend/src/signals/lifecycle.service.ts) — `check3OBLifecycle`, `deleteStale3OBCompleted`
