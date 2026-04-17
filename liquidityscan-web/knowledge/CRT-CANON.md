# CRT — канон реализации (as-built)

Краткая сверка с кодом; подробности в [../docs/CRT-SCANNER.md](../docs/CRT-SCANNER.md).

## Детекция

- Файл: `backend/src/signals/indicators/crt.detect.ts`
- Последняя пара свечей: sweep за prev high/low, тело строго внутри диапазона prev, `|body prev| > |body curr|`.
- Bull + bear одновременно → `null`.

## Скан

- ТФ: **1h, 4h, 1d, 1w** — `scanner.service.ts` → `CrtScanner.scanFromCandles` с **последними 120** барами из WS/снимка; формирующаяся свеча отбрасывается.

## Персистенция

- Id: `CRT-{symbol}-{timeframe}-{openTime}`.
- `saveScannerSignal` → `addSignals`; затем **`archiveOldSignals('CRT', ...)`**: оставить только **последнюю** строку по symbol+TF, **без** восстановления COMPLETED → ACTIVE.

## Lifecycle

- `lifecycle.service.ts` → **`checkCrtLifecycle`**: до **120** закрытых klines; свечи с `openTime > detectedAt`, сортировка по времени; **1-я и 2-я** после сигнала → классификация **STRONG / WEAK / FAILED** по close vs `prev_high` / `prev_low` / `price`.
- Удаление COMPLETED старше **24h**; застой **>48h** PENDING/ACTIVE → force close в глобальной очистке.

## Тесты

- `backend/src/signals/indicators/crt.detect.spec.ts`
