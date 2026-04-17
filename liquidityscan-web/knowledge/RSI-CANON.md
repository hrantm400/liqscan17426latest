# RSI Divergence — канон (Standard) и реализация

Источник продуктовой логики: чаты Perplexity в [knowledge/perplexity/](perplexity/) (сводка и аудит). Сверка с кодом: [GAP-ANALYSIS.md](./GAP-ANALYSIS.md).

---

## Целевое поведение (Standard RSI)

1. **RSI:** период **14**, сглаживание **Wilder (RMA)** по close, в духе TradingView.
2. **Пивоты:** только по **ряду RSI**; по умолчанию **lbL = 5**, **lbR = 1** (подтверждение пивота справа быстрее, чем при большом lbR).
3. **Типы:** только **regular** bullish / bearish; **hidden** не используются.
4. **Условия:** bullish — цена lower low, RSI higher low, предыдущий пивот RSI &lt; `limitLower` (30); bearish — higher high, lower high, предыдущий пивот RSI &gt; `limitUpper` (70); расстояние между пивотами **rangeLower–rangeUpper** (5–60 баров).
5. **Эмиссия детектора:** только **последняя пара** подтверждённых пивотов low и отдельно high (не все пары в окне).
6. **Свечи:** в расчёт входят только **закрытые** свечи (текущая формирующаяся отбрасывается).
7. **Lifecycle:** активный сигнал закрывается (`COMPLETED` / `CLOSED`), если выполняется **любое** из условий:
   - с `detectedAt` прошло **15 полных свечей** данного таймфрейма;
   - на скане детектор вернул **хотя бы один** сигнал, и id строки **не входит** в расширенное множество id этого прохода (другой пивот/тип — старая строка снимается). Если детектор вернул **пустой** список, **массово не закрываем** все активные по паре: пустой вывод част при перерисовке пивотов; истечение только по правилу 15 свечей.
   - после закрытия строка с `COMPLETED` удаляется, если `closedAt` старше **24 часов** (для пары symbol+timeframe и обоих типов стратегии RSI).

### Правило по нескольким активным строкам (product)

Детектор на одном проходе выдаёт **не больше двух** сигналов (bull и/или bear), каждый со своим id (`RSIDIVERGENCE-{symbol}-{timeframe}-{openTime пивота}`). В БД для пары symbol+timeframe может быть **несколько** активных строк. Если текущий скан вернул непустой список id, активные строки с **другими** id закрываются. Пустой детект **не** означает «закрыть всё сразу».

---

## Реализация в коде (as-built)

### RSI

- **Файл:** `backend/src/signals/indicators/rsi-math.ts`  
- **Период по умолчанию:** 14 (`rsiLength` в `RSIDivergenceConfig`).

### Пивоты и детектор

- **Файл:** `backend/src/signals/indicators/rsi-divergence.detect.ts`  
- Пивоты по RSI; по умолчанию `lbL = 5`, `lbR = 1`.  
- Только regular; типы в `backend/src/signals/indicators/candle-types.ts` (`RSIDivergenceSignal`).

### Сканер

- **Файл:** `backend/src/signals/scanners/rsi-divergence.scanner.ts`  
- `closedCandles = candles.slice(0, -1)`; минимум 30 закрытых баров; **500** klines через `scanner-candles.helper.ts`.  
- В БД попадают **все** сигналы, которые вернул `detectRSIDivergence` (до двух), без отсечения только по «последнему бару».  
- `strategyType`: **`RSIDIVERGENCE`**; id: `RSIDIVERGENCE-{symbol}-{timeframe}-{signal.time}`.  
- После `addSignals` вызывается **`await closeStaleRsiSignals(symbol, timeframe, currentIds)`** с id из текущего детекта.

### Плановый скан

- **Файл:** `backend/src/signals/scanner.service.ts` — 1h / 4h / 1d и `getRsiConfig` / `setRsiConfig`.

### Закрытие и TTL

- **`closeStaleRsiSignals`** (`signals.service.ts`):  
  1. Закрытие по возрасту: **15 свечей** ТФ (оба типа RSI).  
  2. Если скан передал **непустой** список id: закрыть активные, чей `id` **не** в расширенном множестве (включая legacy-префикс). Пустой список — **без** этого шага.  
  3. `deleteMany` для `COMPLETED` старше 24h — оба типа.  
- **Lifecycle** `deleteStaleCompletedGlobal`: принудительный stuck **CRT** / ICT по своим правилам; RSI там не force-close по 48h.

### Legacy

- Строки `RSI_DIVERGENCE` / id `RSI_DIVERGENCE-...` обрабатываются в `closeStaleRsiSignals` так же по TTL и подтверждению (суффикс id сопоставляется с id скана `RSIDIVERGENCE-...`). Фронт учитывает оба префикса (см. `utils/rsiStrategy.ts`).
