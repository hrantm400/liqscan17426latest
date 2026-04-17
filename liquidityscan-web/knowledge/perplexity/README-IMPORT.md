# Импорт чатов Perplexity с твоего ПК

Путь вроде `~/Downloads/memory of liqscan/` есть **только на твоём компьютере**. Скопируй все `.md` в `liquidityscan-web/knowledge/perplexity/`.

## Одна команда (Linux / macOS)

Из **корня репозитория** `liquidityscan-app`:

```bash
SRC="$HOME/Downloads/memory of liqscan"
DEST="$(pwd)/liquidityscan-web/knowledge/perplexity"
mkdir -p "$DEST"
cp -v "$SRC"/*.md "$DEST/"
```

Если какой-то файл без расширения `.md` — скопируй вручную и дай имя с `.md`.

## Скрипт

```bash
chmod +x liquidityscan-web/knowledge/perplexity/import-from-downloads.sh
./liquidityscan-web/knowledge/perplexity/import-from-downloads.sh
```

Другой каталог-источник: `./liquidityscan-web/knowledge/perplexity/import-from-downloads.sh "/path/to/folder"`

## Имена из твоего списка

После `cp` окажутся здесь (включая `(1)`…`(7)`):  
`canyou-read-ts-files-i-know-yo-MoVnV35jT4S5mNnqtTF7hw.md`, `hey-there-im-building-an-app-c-e0YJfpq6TcukLZlmAnbezg.md`, `lets-talk-ls-YLJ5nXIeTZCmn1Hmtc6dpg.md`, `pls-get-familiar-with-all-ive-RRCE_Po6SjGjrMP8QEkQGw.md`, `So let me explain previously the scanner one huge.md`, `so-let-me-explain-previously-t-TRTONAf1Q8ek9kCUyiENMA.md` и копии, `ty-zhe-umeesh-potianut-dannye-XPKiFOvdRMusPHTDf2zzjg.md` и при необходимости `(1)`.

Потом: `git add liquidityscan-web/knowledge/perplexity/*.md` и коммит.

Если копируешь сырые экспорты как файлы `1`, `2`, … без `.md`, после импорта можно проверить дубликаты: `md5sum perplexity/[0-9]*` — одинаковый хеш = побитово один файл. Файлы `11` и `13` при необходимости восстанавливаются копией `10`, если в git не было своей версии; если у тебя на ПК экспорты отличались — перезалей их с `~/Downloads/memory of liqscan/`.
