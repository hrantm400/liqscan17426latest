# Knowledge (Perplexity / внешние чаты)

Сюда кладите экспорты диалогов (`.md`), чтобы сверять спецификации стратегий с кодом.

## Perplexity (сырые экспорты)

Папка **[perplexity/](./perplexity/)** — сюда копируй `.md` из `~/Downloads/memory of liqscan/` на **своём ПК** ([README-IMPORT.md](./perplexity/README-IMPORT.md), скрипт `import-from-downloads.sh`). Сервер не видит твой `Downloads`: копируешь ты, затем `git add` / `push`.

## Текущий инвентарь (корень `knowledge/`)

| Файл | Темы (RSI / прочее) | Примечание |
|------|---------------------|------------|
| RSI-CANON.md | Standard RSI + реализация | Целевое поведение (Perplexity) и as-built |
| CRT-CANON.md | CRT as-built | Детали: [docs/CRT-SCANNER.md](../docs/CRT-SCANNER.md) |
| GAP-ANALYSIS.md | Сверка с кодом | Обновлять после изменений |
| perplexity/*.md | после импорта | Список — в README-IMPORT |

## Рекомендуемые имена

- `perplexity-rsi-YYYY-MM-DD.md` — обсуждения RSI / дивергенций  
- `perplexity-crt-....md` — CRT и т.д.

## Связанные артефакты репозитория

- [RSI-CANON.md](./RSI-CANON.md) — Standard RSI (чаты) и соответствие коду.  
- [CRT-CANON.md](./CRT-CANON.md) — CRT в коде; полный разбор в [docs/CRT-SCANNER.md](../docs/CRT-SCANNER.md).  
- [GAP-ANALYSIS.md](./GAP-ANALYSIS.md) — последняя сверка спека/кода и закрытые пробелы.
