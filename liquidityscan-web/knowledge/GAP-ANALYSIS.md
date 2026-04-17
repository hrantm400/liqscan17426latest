# Gap analysis: RSI (knowledge ↔ код)

**Дата:** 2026-03-30  
**Источник:** целевое поведение зафиксировано в [RSI-CANON.md](./RSI-CANON.md) (в т.ч. из экспортов [knowledge/perplexity/](perplexity/)); сверка с кодом backend + фронт.

| Пункт | Код | Статус | Примечание |
|-------|-----|--------|------------|
| RSI Wilder 14 | `rsi-math.ts`, `rsi-divergence.detect.ts` | OK | — |
| Пивоты по RSI, lbL/lbR | `rsi-divergence.detect.ts` | OK | — |
| Только regular bull/bear | `candle-types.ts`, detect | OK | — |
| Закрытие по 15 свечам | `signals.service.ts` `closeStaleRsiSignals` | OK | Оба strategyType RSI |
| Закрытие если id не в текущем детекте | `closeStaleRsiSignals` + сканер передаёт `currentIds` | OK | Только если детект непустой; пустой — без массового close |
| Legacy `RSI_DIVERGENCE` в stale/delete | `closeStaleRsiSignals` | OK | Расширение множества подтверждённых id по суффиксу |
| Сканер: `await closeStaleRsiSignals` | `rsi-divergence.scanner.ts` | OK | Порядок относительно `addSignals` сохранён |
| CRT lifecycle klines + post-signal sort | `lifecycle.service.ts` `checkCrtLifecycle` | OK | 120 klines; 1-я/2-я свеча после `detectedAt` |
| CRT archive без restore COMPLETED | `signals.service.ts` `archiveOldSignals` | OK | Только latest id, без ACTIVE-resurrect |
| CRT-only / ICT stuck vs RSI | `lifecycle.service.ts` | OK | RSI не 48h stuck в global cleanup |
| Фронт: union `RSI_DIVERGENCE` / `RSIDIVERGENCE` | `signalsApi.ts`, `rsiStrategy.ts` | OK | — |
| Тип `StrategyType` / UI маршруты | `types/index.ts` и др. | OK | — |

Ранее зафиксированный разрыв («`currentActiveIds` игнорируется», только time-based stale) **закрыт** реализацией подтверждения по id на скане.
