# Сигналы: где лежат и как работает логика

## Структура проекта (где что лежит)

### Backend (NestJS)

| Путь | Назначение |
|------|------------|
| `liquidityscan-web/backend/src/signals/signals.controller.ts` | API: GET/POST сигналов, webhook, scan, live-bias |
| `liquidityscan-web/backend/src/signals/signals.service.ts` | Нормализация webhook-тела, сохранение/чтение сигналов (БД + in-memory), преобразование Grno → внутренний формат |
| `liquidityscan-web/backend/src/signals/scanner.service.ts` | Сканирование Binance: Super Engulfing, ICT Bias, RSI Divergence по парам; кэш live bias |
| `liquidityscan-web/backend/src/signals/indicators.ts` | Алгоритмы: RSI, пивоты, Super Engulfing (REV/RUN), ICT Bias |
| `liquidityscan-web/backend/src/signals/dto/webhook-signal.dto.ts` | Допустимые таймфреймы и DTO для webhook |
| `liquidityscan-web/backend/prisma/schema.prisma` | Модель `SuperEngulfingSignal` (таблица `super_engulfing_signals`) |

### Frontend

| Путь | Назначение |
|------|------------|
| `liquidityscan-web/frontend/src/services/signalsApi.ts` | Запросы: fetchSignals, fetchSignalById, scanAll, fetchLiveBias |
| `liquidityscan-web/frontend/src/pages/SignalDetails.tsx` | Страница деталей сигнала |
| `liquidityscan-web/frontend/src/components/shared/SignalBadge.tsx` | Отображение типа сигнала (BUY/SELL и т.д.) |

### Корень (статический вариант)

| Путь | Назначение |
|------|------------|
| `js/indicators.js` | Индикаторы (если есть дубликат логики для статической страницы) |
| `js/binance.js`, `js/chart.js`, `js/app.js` | Работа с Binance и графиками на главной |

---

## Как работает логика сигналов

### 1. Источники сигналов

- **Webhook (внешний, например Grno)**  
  POST `/api/signals/webhook` с заголовком `x-webhook-secret`. Тело нормализуется в `signals.service.normalizeWebhookBody`, затем маппится в формат с `strategyType`, `symbol`, `timeframe`, `signalType` (BUY/SELL), `price`, `detectedAt` и сохраняется через `addSignals`.

- **Внутренний скан (ScannerService)**  
  По расписанию (каждые 30 мин + раз при старте) вызывается `scanAll()`: берутся все USDT-пары с Binance, для каждой проверяются три стратегии по нужным таймфреймам. Свечи запрашиваются через `CandlesService`, индикаторы считаются в `indicators.ts`, новые сигналы пишутся через `signalsService.addSignals`.

### 2. Стратегии и таймфреймы

- **SUPER_ENGULFING** — таймфреймы `4h`, `1d`, `1w`.  
  Логика в `indicators.detectSuperEngulfing`: последняя закрытая свеча + предыдущая; паттерны RUN (продолжение) и REV (разворот), бычьи/медвежьи, опционально Plus (закрытие за пределы предыдущей свечи). Результат: `direction` BUY/SELL, `pattern` RUN/RUN_PLUS/REV/REV_PLUS.

- **ICT_BIAS** — таймфреймы `4h`, `1d`, `1w`.  
  Логика в `indicators.detectICTBias`: предыдущая закрытая свеча (close) относительно high/low свечи «день назад». Если close < prevLow → BEARISH/SELL; если close > prevHigh → BULLISH/BUY; иначе RANGING (не сохраняем). Live bias для символов с уже сохранёнными ICT_BIAS по таймфрейму пересчитывается в `scanner.getLiveBias` (кэш 60 сек).

- **RSI_DIVERGENCE** — таймфреймы `1h`, `4h`, `1d`.  
  Логика в `indicators.detectRSIDivergence`: RSI (Wilder), пивоты по RSI (lbL/lbR = 5), поиск бычьих/медвежьих и скрытых дивергенций в последних 30 свечах. Сохраняются только сигналы по последнему подтверждённому пивету (чтобы не дублировать старые).

### 3. Сохранение и хранение

- В `signals.service.addSignals`: допустимые `strategyType` — `SUPER_ENGULFING`, `RSI_DIVERGENCE`, `ICT_BIAS`; таймфреймы — из `dto/webhook-signal.dto` (4h, 1d, 1w для Super Engulfing/ICT; 1h, 4h, 1d для RSI).  
- Каждый сигнал получает уникальный `id` (или из webhook), пишется в in-memory кэш и в Prisma (`SuperEngulfingSignal`). Лимит кэша — 5000 записей (обрезание по старым).  
- Чтение: `getSignals(strategyType?)` и `getSignalById(id)` — сначала из БД, при ошибке — из кэша.

### 4. Webhook (для Python / Grno)

- **URL:** `POST https://liquidityscan.io/api/signals/webhook`  
- **Заголовки:** `Content-Type: application/json`, `x-webhook-secret: <secret>` (значение как в `SIGNALS_WEBHOOK_SECRET` на сервере).

Поддерживаются три формата тела:

1. **Пакет:** `{ "signals": [ { "symbol", "price", "signals_by_timeframe" }, ... ] }`.
2. **Один символ:** тело = один объект с `symbol`, `price`, `signals_by_timeframe` (или `signalsByTimeframe`).
3. **Обёртка Grno:** `{ "event", "timestamp", "coin": { "symbol", "current_price", "signals": { "4h": { "signals": ["REV Bull"], "price", "time" }, "1d", "1w" } } }` — используется `body.coin`.

В каждом блоке по таймфрейму: массив `signals` (строки). Если строка содержит `"Bear"` → SELL, иначе → BUY. Обрабатываются только таймфреймы **4h, 1d, 1w** (1h и остальные игнорируются).

**Ответ:** 200 → `{ "received": <число принятых> }`; 401 — неверный или отсутствующий секрет.

**Логи на сервере:**  
- «Webhook POST /signals/webhook — request received» — запрос дошёл;  
- «Webhook rejected: invalid or missing x-webhook-secret» — 401;  
- «Webhook authenticated (secret OK)» — секрет верный;  
- «Webhook result: payload coins=…, parsed (4h/1d/1w)=…, accepted=…» — сколько элементов в теле, сколько распаршено по 4h/1d/1w, сколько сохранено.

---

## API для фронта

- `GET /api/signals` — список сигналов (опционально `?strategyType=SUPER_ENGULFING` и т.д.).  
- `GET /api/signals/:id` — один сигнал по id.  
- `POST /api/signals/scan` — ручной запуск полного скана.  
- `GET /api/signals/live-bias?timeframe=4h` — актуальный ICT bias по символам с сохранёнными ICT_BIAS для данного таймфрейма (кэш 60 сек).
