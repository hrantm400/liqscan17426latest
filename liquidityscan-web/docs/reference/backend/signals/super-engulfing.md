# Super Engulfing (SE) — v2

## `detectSuperEngulfing`
**File:** [`backend/src/signals/indicators/super-engulfing.detect.ts`](../../../../backend/src/signals/indicators/super-engulfing.detect.ts)  

**Purpose:** Returns array of confirmed patterns with **v2** fields: `pattern_v2`, `direction_v2`, entry/SL/TP ladder prices, legacy fields for compatibility.

---

## `SuperEngulfingScanner`
**File:** [`backend/src/signals/scanners/super-engulfing.scanner.ts`](../../../../backend/src/signals/scanners/super-engulfing.scanner.ts):13+  

### `scanFromCandles`
**Purpose:** For each confirmed signal, id includes **pattern_v2** to allow multiple concurrent live signals per symbol+TF; attaches `max_candles` from `getMaxCandlesForTimeframe` (`se-runtime`); `addSignals` with extended metadata.

### `scan`
**Purpose:** Standard candle fetch + `scanFromCandles`.

---

## `se-runtime`
**File:** [`backend/src/signals/se-runtime.ts`](../../../../backend/src/signals/se-runtime.ts)  

**Exports:** `processSeSignal`, `SeRuntimeSignal`, `SeDirection`, `getMaxCandlesForTimeframe`, `mapResultToLegacy`, `mapStateToLegacyStatus` — used by `LifecycleService` for TP/SL progression and result mapping.

---

## `LifecycleService` SE hooks
**File:** [`lifecycle.service.ts`](../../../../backend/src/signals/lifecycle.service.ts)  

- `checkSuperEngulfingV2` — advance state machine on new prices/candles.
- `deleteExpiredSeSignals` — hard delete when `delete_at` reached (closed + 48h).

---

## Tests
- [`se-runtime.spec.ts`](../../../../backend/src/signals/se-runtime.spec.ts)
