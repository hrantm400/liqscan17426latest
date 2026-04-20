#!/usr/bin/env bash
# LiquidityScan Postgres backup — PR 3.4
#
# - pg_dump -Fc piped directly into gpg --symmetric (plaintext never touches disk)
# - local retention: 14 rolling dailies + 8 rolling Sundays on top
# - off-box mirror: rclone to Backblaze B2 (same daily/ + weekly/ layout)
# - dead-man switch: healthchecks.io /start, success, /fail pings
# - Telegram: failure alert always; success message when TELEGRAM_NOTIFY_SUCCESS=1
#
# Exit codes: 0 success, 1 misconfig or runtime failure.
# Config is sourced from $BACKUP_ENV_FILE (default /etc/liquidityscan-backup.env).

set -euo pipefail
IFS=$'\n\t'
umask 077

# ---- Load config ----
ENV_FILE="${BACKUP_ENV_FILE:-/etc/liquidityscan-backup.env}"
if [ ! -r "$ENV_FILE" ]; then
  echo "FATAL: env file not readable: $ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${PGHOST:?PGHOST missing}" "${PGUSER:?PGUSER missing}"
: "${PGPASSWORD:?PGPASSWORD missing}" "${PGDATABASE:?PGDATABASE missing}"
: "${BACKUP_DIR:?BACKUP_DIR missing}" "${GPG_PASSPHRASE_FILE:?GPG_PASSPHRASE_FILE missing}"
: "${HEALTHCHECKS_PING_URL:?HEALTHCHECKS_PING_URL missing}"
: "${B2_BUCKET:?B2_BUCKET missing}"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN missing}"
: "${TELEGRAM_ADMIN_CHAT_ID:?TELEGRAM_ADMIN_CHAT_ID missing}"
TELEGRAM_NOTIFY_SUCCESS="${TELEGRAM_NOTIFY_SUCCESS:-1}"
DRY_RUN="${DRY_RUN:-0}"
export PGPASSWORD

# ---- Derived paths ----
DATE="$(date -u +%Y-%m-%d)"
START_TS="$(date -u +%s)"
DAILY_DIR="$BACKUP_DIR/daily"
WEEKLY_DIR="$BACKUP_DIR/weekly"
DUMP_PATH="$DAILY_DIR/${DATE}.dump.gpg"
LOG_FILE="$BACKUP_DIR/backup.log"
LOCK="/var/run/liquidityscan-backup.lock"

# ---- Sanity ----
for bin in pg_dump gpg rclone curl flock find date stat hostname tail; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "FATAL: missing binary: $bin" >&2
    exit 1
  fi
done
mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"
touch "$LOG_FILE"
if [ ! -r "$GPG_PASSPHRASE_FILE" ]; then
  echo "FATAL: GPG passphrase file unreadable: $GPG_PASSPHRASE_FILE" >&2
  exit 1
fi

# ---- Helpers ----
log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG_FILE"
}

hc_ping() {
  # best-effort — network hiccups must not mask the real error
  curl -fsS -m 10 --retry 3 --retry-delay 2 "$1" -o /dev/null || true
}

tg_send() {
  local text="$1"
  curl -fsS -m 10 --retry 2 --retry-delay 2 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_ADMIN_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    -o /dev/null || true
}

on_error() {
  local rc=$?
  local duration=$(( $(date -u +%s) - START_TS ))
  local tail_log
  tail_log="$(tail -n 30 "$LOG_FILE" 2>/dev/null | sed 's/`/'\''/g')"
  log "FAILED rc=$rc duration=${duration}s"
  hc_ping "${HEALTHCHECKS_PING_URL}/fail"
  tg_send "$(printf 'liquidityscan backup FAILED\nhost=%s rc=%s duration=%ss\n\n%s' "$(hostname)" "$rc" "$duration" "$tail_log")"
  exit "$rc"
}
trap on_error ERR

# ---- Single-instance lock ----
exec 9>"$LOCK"
if ! flock -n 9; then
  log "another run in progress — exiting"
  exit 0
fi

# ---- Go ----
hc_ping "${HEALTHCHECKS_PING_URL}/start"
log "=== backup start date=$DATE dryRun=$DRY_RUN host=$(hostname) ==="

if [ "$DRY_RUN" = "1" ]; then
  log "[dry-run] would: pg_dump -Fc -h $PGHOST -U $PGUSER -d $PGDATABASE | gpg --symmetric > $DUMP_PATH"
  log "[dry-run] would: rclone copy $DUMP_PATH b2:${B2_BUCKET}/daily/"
  if [ "$(date -u +%u)" = "7" ]; then
    log "[dry-run] would: copy to $WEEKLY_DIR and b2:${B2_BUCKET}/weekly/ (Sunday)"
  fi
  log "[dry-run] would: prune daily >14d, weekly >56d, local and B2"
  hc_ping "$HEALTHCHECKS_PING_URL"
  duration=$(( $(date -u +%s) - START_TS ))
  log "=== backup dry-run ok duration=${duration}s ==="
  exit 0
fi

# ---- Dump + encrypt (single pipe, no plaintext on disk) ----
# PIPESTATUS is bash-specific and checked explicitly; set -o pipefail also
# catches failures upstream.
pg_dump -Fc -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" \
  | gpg --symmetric --cipher-algo AES256 --batch --yes \
        --passphrase-file "$GPG_PASSPHRASE_FILE" \
        --output "$DUMP_PATH"

if [ ! -s "$DUMP_PATH" ]; then
  log "dump is empty"
  exit 1
fi
SIZE="$(stat -c%s "$DUMP_PATH")"
if [ "$SIZE" -lt 10240 ]; then
  log "dump suspiciously small: ${SIZE}B"
  exit 1
fi
log "dump ok path=$DUMP_PATH size=${SIZE}B"

# ---- Sunday promotion (ISO day-of-week 7 = Sunday, UTC) ----
if [ "$(date -u +%u)" = "7" ]; then
  cp -- "$DUMP_PATH" "$WEEKLY_DIR/${DATE}.dump.gpg"
  log "weekly promoted: ${DATE}.dump.gpg"
fi

# ---- Off-box mirror ----
rclone copy --quiet --checksum "$DUMP_PATH" "b2:${B2_BUCKET}/daily/"
if [ -f "$WEEKLY_DIR/${DATE}.dump.gpg" ]; then
  rclone copy --quiet --checksum "$WEEKLY_DIR/${DATE}.dump.gpg" "b2:${B2_BUCKET}/weekly/"
fi
log "b2 mirror ok"

# ---- Retention (local + remote, mtime-based) ----
find "$DAILY_DIR"  -type f -name '*.dump.gpg' -mtime +14 -print -delete | while read -r f; do log "pruned local daily: $f"; done
find "$WEEKLY_DIR" -type f -name '*.dump.gpg' -mtime +56 -print -delete | while read -r f; do log "pruned local weekly: $f"; done
rclone delete --quiet --min-age 14d "b2:${B2_BUCKET}/daily/"  || log "b2 daily prune warning (non-fatal)"
rclone delete --quiet --min-age 56d "b2:${B2_BUCKET}/weekly/" || log "b2 weekly prune warning (non-fatal)"
log "retention pruned"

# ---- Success ----
DURATION=$(( $(date -u +%s) - START_TS ))
log "=== backup success duration=${DURATION}s size=${SIZE}B ==="
hc_ping "$HEALTHCHECKS_PING_URL"
if [ "$TELEGRAM_NOTIFY_SUCCESS" = "1" ]; then
  tg_send "$(printf 'liquidityscan backup OK\ndate=%s size=%sB duration=%ss\nhost=%s' "$DATE" "$SIZE" "$DURATION" "$(hostname)")"
fi
