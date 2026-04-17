# CRT — Candle Range Theory detector

## `detectCRT`
**File:** [`backend/src/signals/indicators/crt.detect.ts`](../../../../backend/src/signals/indicators/crt.detect.ts)  

**Purpose:** Detect sweep/setup per CRT rules on closed candles; returns direction, price, time, swept levels for metadata.

---

## `CrtScanner`
**File:** [`backend/src/signals/scanners/crt.scanner.ts`](../../../../backend/src/signals/scanners/crt.scanner.ts):10-46  

### `scanFromCandles`
**Purpose:** `detectCRT` on closed candles; `saveScannerSignal` with strategy `CRT` and rich metadata (`swept_level`, `prev_high`, etc.).

### `scan`
**Purpose:** `getScannerCandles` → `scanFromCandles`.

---

## Lifecycle
**File:** [`lifecycle.service.ts`](../../../../backend/src/signals/lifecycle.service.ts) — `checkCrtLifecycle`, `deleteStaleCrtCompleted`
