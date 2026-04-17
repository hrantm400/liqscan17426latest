# CISD (MSS) — Change in State of Delivery

## Detector exports
**File:** [`backend/src/signals/indicators/cisd.detect.ts`](../../../../backend/src/signals/indicators/cisd.detect.ts)  

**Purpose:** `detectAllMSS` (and related) — market structure shift detection using pivot logic; options `lbLeft`, `lbRight`, `minSeq` align with `AppConfig` CISD fields.

**Related:** [`candle-types.ts`](../../../../backend/src/signals/indicators/candle-types.ts) for shared candle shapes.

---

## `CisdScanner`
**File:** [`backend/src/signals/scanners/cisd.scanner.ts`](../../../../backend/src/signals/scanners/cisd.scanner.ts):14+  

### `scanFromCandles`
**Purpose:** ≥60 closed bars; load `AppConfigService.getConfig()` for pivot params; `detectAllMSS`; insert new rows with deterministic ids `CISD-${symbol}-${timeframe}-${time}`; skip duplicates; cap active signals (`MAX_ACTIVE_CISD`); optional Telegram suppression for historical markers (see full file).

### `scan`
**Purpose:** Fetch candles via `getScannerCandles` (200 limit constant in file).

---

## Tests
- [`crt.detect.spec.ts`](../../../../backend/src/signals/indicators/crt.detect.spec.ts) — nearby; CISD may have dedicated specs — search `cisd` in `backend/src/signals`.
