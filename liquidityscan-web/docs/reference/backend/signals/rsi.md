# RSI divergence — indicators and scanner

## `calculateRSI`
**File:** [`backend/src/signals/indicators/rsi-math.ts`](../../../../backend/src/signals/indicators/rsi-math.ts):4-40  
**Kind:** exported function  
**Signature:** `calculateRSI(closes: number[], length?: number): number[]`  

**Purpose:** Wilder RSI (RMA smoothing) to match TradingView.

**Key logic:** Seed average gain/loss over `length`; then Wilder smooth; output NaN until enough bars.

---

## `findPivotLows` / `findPivotHighs`
**File:** [`backend/src/signals/indicators/rsi-divergence.detect.ts`](../../../../backend/src/signals/indicators/rsi-divergence.detect.ts):7-54  
**Kind:** private functions  
**Purpose:** Pivot detection on RSI series with configurable left/right bars (`lbL`, `lbR`).

---

## `detectRSIDivergence`
**File:** [`backend/src/signals/indicators/rsi-divergence.detect.ts`](../../../../backend/src/signals/indicators/rsi-divergence.detect.ts):60+  
**Signature:** `detectRSIDivergence(candles: CandleData[], config?: RSIDivergenceConfig): RSIDivergenceSignal[]`  

**Purpose:** Regular bull/bear divergence only; at most one bullish and/or one bearish signal — last confirmed pivot vs prior pivot.

**Outputs:** Divergence type, price levels, RSI values, bar indices for metadata.

---

## `RsiDivergenceScanner`
**File:** [`backend/src/signals/scanners/rsi-divergence.scanner.ts`](../../../../backend/src/signals/scanners/rsi-divergence.scanner.ts):9+  

### `scanFromCandles`
**Purpose:** Drop forming candle; require ≥30 closed bars; run `detectRSIDivergence`; map to `RSIDIVERGENCE` inputs with id `RSIDIVERGENCE-${symbol}-${timeframe}-${time}`; `addSignals`; `closeStaleRsiSignals` with current id set.

### `scan`
**Purpose:** `getScannerCandles` then `scanFromCandles`.

---

## Tests / bench
- [`test_rsidivergence.ts`](../../../../backend/src/signals/test_rsidivergence.ts), [`test_rsidivergence.spec.ts`](../../../../backend/src/signals/test_rsidivergence.spec.ts), [`rsi-lifecycle.spec.ts`](../../../../backend/src/signals/rsi-lifecycle.spec.ts), [`benchmark.spec.ts`](../../../../backend/src/signals/benchmark.spec.ts)
