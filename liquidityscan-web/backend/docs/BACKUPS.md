# LiquidityScan DB backups

PR 3.4 — automated, encrypted, off-box Postgres backups with dead-man
alerting. This file is the single source of truth for install, operate,
and restore.

## Overview

- **What:** full `liquidityscan_db` dump in `pg_dump -Fc` format,
  encrypted with GPG symmetric AES256.
- **When:** daily at **04:30 UTC** via `/etc/cron.d/liquidityscan-backup`.
- **Where:**
  - Local: `/var/backups/liquidityscan/{daily,weekly}/`
  - Off-box: Backblaze B2 bucket, same `daily/` + `weekly/` layout.
- **How we know it ran:** healthchecks.io dead-man switch (no ping in
  25h → external alert) + Telegram message on every success and every
  failure.

Restore is **manual and runbook-driven** — we deliberately do not expose
a restore API.

## On-disk layout

```
/var/backups/liquidityscan/
├── daily/              # 14 rolling dumps
│   ├── 2026-04-20.dump.gpg
│   └── ...
├── weekly/             # 8 rolling Sundays
│   ├── 2026-04-19.dump.gpg
│   └── ...
└── backup.log          # append-only, one line per step
```

- `file daily/2026-04-20.dump.gpg` reports `GPG symmetrically encrypted
  data`. Plaintext dump never touches disk — `pg_dump | gpg` is a single
  pipe.
- `backup.log` grows slowly (tens of KB / day). Rotate via standard
  logrotate if desired; nothing else depends on truncating it.

## Retention policy

| Tier | Keep | Prune rule |
|---|---|---|
| daily | last 14 | `find daily -mtime +14 -delete` |
| weekly | last 8 Sundays | copied from daily on Sunday, `find weekly -mtime +56 -delete` |

Same mirror in B2:

- `rclone delete --min-age 14d b2:$B2_BUCKET/daily/`
- `rclone delete --min-age 56d b2:$B2_BUCKET/weekly/`

Approximate disk footprint on the current 61 MB DB: ~20 MB per encrypted
dump × 22 files ≈ 440 MB local. Negligible on a 193 GB disk.

## Encryption

- **Algorithm:** AES256 via GPG symmetric (`gpg --symmetric
  --cipher-algo AES256 --batch --passphrase-file`).
- **Passphrase:** stored in `/etc/liquidityscan-backup.passphrase`
  (chmod 600, root-owned). **Lose it and every encrypted dump is
  unrecoverable.** Also store it in a password manager.
- The passphrase file is separate from the env file so the passphrase
  never appears in `ps aux` or `/proc/<pid>/environ`.
- B2 bucket additionally has server-side encryption enabled — GPG is
  the primary layer, B2 SSE is defense-in-depth.

## Dead-man switch: healthchecks.io

1. Sign up at <https://healthchecks.io> (free tier: 1 check, plenty for
   a single daily cron).
2. Create a new check:
   - Name: `liquidityscan daily backup`
   - Schedule: cron `30 4 * * *`, timezone **UTC**
   - Grace time: **60 minutes**
3. Copy the ping URL (format `https://hc-ping.com/<UUID>`).
4. Put the full URL in `/etc/liquidityscan-backup.env` as
   `HEALTHCHECKS_PING_URL=`.
5. The script pings three endpoints:
   - `.../start` when the run begins
   - `...` (no suffix) on success
   - `.../fail` on any error (via `trap ERR`)
6. Healthchecks emails (or Slack / Telegram / webhooks) when:
   - no success ping arrives within schedule + grace, **or**
   - a `/fail` ping arrives explicitly.

## Telegram alerts

- Reuses the existing bot token from
  `liquidityscan-web/backend/.env` (`TELEGRAM_BOT_TOKEN`).
- Admin chat_id: your personal chat with the bot, or an admin group
  where the bot is a member. Discover it via `@userinfobot` or by
  messaging `/start` to the bot and reading the chat_id from the
  backend log.
- Default: **success message on every run** (`TELEGRAM_NOTIFY_SUCCESS=1`).
  Silence for one morning = something to look at. Set to `0` in
  `/etc/liquidityscan-backup.env` if daily OK messages become noise.
- Failure alerts always fire (trap ERR → `tg_send`), regardless of the
  success toggle.

## Backblaze B2 off-box mirror

1. Create a Backblaze account (<https://www.backblaze.com/b2>). Free
   tier has 10 GB storage + 1 GB/day egress — well above our needs.
2. Create a private bucket, for example `liquidityscan-backups`. Enable
   **server-side encryption** in bucket settings.
3. Create an **application key** scoped to that bucket only (not the
   master key). Note the `keyID` and `applicationKey`.
4. On the server, configure rclone (one-time):
   ```
   rclone config
   # n) new remote
   # name> b2
   # Storage> b2
   # account> <keyID>
   # key> <applicationKey>
   # accept defaults, save
   ```
   The config lives at `~root/.config/rclone/rclone.conf` (chmod 600).
5. Put the bucket name in `/etc/liquidityscan-backup.env` as
   `B2_BUCKET=liquidityscan-backups`.
6. Sanity check: `rclone ls b2:liquidityscan-backups` should succeed
   and return empty (or today's dumps after first run).

## Install runbook

Run as `root` on the production server after merging PR 3.4 to master.

```bash
# 1. System deps
apt-get update
apt-get install -y rclone gnupg

# 2. Backup root
mkdir -p /var/backups/liquidityscan/{daily,weekly}
chown -R root:root /var/backups/liquidityscan
chmod 750 /var/backups/liquidityscan /var/backups/liquidityscan/{daily,weekly}

# 3. Secrets — fill values, do not commit
cp /var/www/liquidityscan-app/scripts/backup-db.env.example \
   /etc/liquidityscan-backup.env
chmod 600 /etc/liquidityscan-backup.env
editor /etc/liquidityscan-backup.env  # replace every REPLACE_ME

# 4. GPG passphrase (separate file so it never leaks into `ps`/`environ`)
printf '%s' 'YOUR_LONG_STRONG_PASSPHRASE' > /etc/liquidityscan-backup.passphrase
chmod 600 /etc/liquidityscan-backup.passphrase
# ALSO save this passphrase to a password manager — loss = unrecoverable backups.

# 5. rclone for Backblaze B2
rclone config   # interactive; see B2 section above
rclone ls b2:$B2_BUCKET  # sanity check

# 6. Smoke test — dry-run first
DRY_RUN=1 /var/www/liquidityscan-app/scripts/backup-db.sh
tail -n 20 /var/backups/liquidityscan/backup.log

# 7. Smoke test — real run
/var/www/liquidityscan-app/scripts/backup-db.sh
ls -lh /var/backups/liquidityscan/daily/
rclone ls b2:$B2_BUCKET/daily/

# 8. Install cron
install -m 644 /var/www/liquidityscan-app/cron/liquidityscan-backup \
               /etc/cron.d/liquidityscan-backup
# cron reloads /etc/cron.d automatically; no service restart needed.

# 9. Next-morning check
tail -n 40 /var/backups/liquidityscan/backup.log
ls -lh /var/backups/liquidityscan/daily/ | head
# healthchecks.io dashboard should show a fresh success ping at ~04:31 UTC.
```

## Restore runbook

**Manual, deliberate, never scripted.** Run as `root`.

```bash
# 0. Decide which dump. Latest local:
ls -lt /var/backups/liquidityscan/daily/ | head

# Or from B2 if local is gone:
rclone ls b2:$B2_BUCKET/daily/ | tail
rclone copy b2:$B2_BUCKET/daily/2026-04-20.dump.gpg ./

# 1. Decrypt
gpg --decrypt --batch --yes \
    --passphrase-file /etc/liquidityscan-backup.passphrase \
    2026-04-20.dump.gpg > /tmp/restore.dump

file /tmp/restore.dump   # expect: "PostgreSQL custom database dump"

# 2. Stop the app
pm2 stop liquidityscan-api

# 3. Drop + recreate target DB (DANGEROUS — point of no return)
#    Confirm the DB name twice before running.
sudo -u postgres psql -c "DROP DATABASE liquidityscan_db;"
sudo -u postgres psql -c "CREATE DATABASE liquidityscan_db OWNER liquidityscan;"

# 4. Restore
PGPASSWORD="$DB_PASSWORD" pg_restore \
  -h localhost -U liquidityscan -d liquidityscan_db \
  --no-owner --no-privileges \
  /tmp/restore.dump

# 5. Verify schema matches code
cd /var/www/liquidityscan-app/liquidityscan-web/backend
npx prisma migrate status

# 6. Smoke data
PGPASSWORD="$DB_PASSWORD" psql -h localhost -U liquidityscan \
  -d liquidityscan_db -c "SELECT COUNT(*) FROM \"User\";"

# 7. Rebuild + restart
npm run build
pm2 restart liquidityscan-api
sleep 10
curl -fsS http://localhost:4000/api/health

# 8. Clean up
shred -u /tmp/restore.dump
```

If `prisma migrate status` reports the DB is behind the code, run
`npx prisma migrate deploy` before restarting the app.

## Restore rehearsal (into a throwaway DB)

Monthly sanity check that backups are restorable. Non-destructive — runs
alongside the live DB.

```bash
sudo -u postgres psql -c "CREATE DATABASE liquidityscan_restore_test;"
gpg --decrypt --batch --passphrase-file /etc/liquidityscan-backup.passphrase \
    /var/backups/liquidityscan/daily/LATEST.dump.gpg \
  | PGPASSWORD="$DB_PASSWORD" pg_restore -h localhost -U liquidityscan \
      -d liquidityscan_restore_test --no-owner --no-privileges

# Row-count cross-check against prod
for t in User Signal RefreshToken; do
  echo "== $t =="
  PGPASSWORD="$DB_PASSWORD" psql -h localhost -U liquidityscan -d liquidityscan_db \
    -c "SELECT COUNT(*) FROM \"$t\";"
  PGPASSWORD="$DB_PASSWORD" psql -h localhost -U liquidityscan -d liquidityscan_restore_test \
    -c "SELECT COUNT(*) FROM \"$t\";"
done

sudo -u postgres psql -c "DROP DATABASE liquidityscan_restore_test;"
```

Automation of this rehearsal is tracked as **TD-15**.

## Admin API

Read-only. Requires admin JWT.

- `GET /api/admin/backups` — last 20 dumps across both tiers. Sorted by
  mtime desc. `{ filename, tier, sizeBytes, mtime }`.
- `GET /api/admin/backups/health` — freshness probe.
  `{ latestMtime, ageHours, stale, dailyCount, weeklyCount }`.
  `stale: true` when the newest dump is > 25h old.

Rate limits are documented in
[common/docs/RATE_LIMITS.md](../src/common/docs/RATE_LIMITS.md).

## Verification recipes

```bash
# 1. Latest dump exists and decrypts clean
LATEST=$(ls -t /var/backups/liquidityscan/daily/*.dump.gpg | head -1)
gpg --decrypt --batch --passphrase-file /etc/liquidityscan-backup.passphrase \
    "$LATEST" | head -c 5 | xxd
# Expect: "PGDMP" header

# 2. B2 mirror matches local
diff <(ls /var/backups/liquidityscan/daily/ | sort) \
     <(rclone ls b2:$B2_BUCKET/daily/ | awk '{print $2}' | sort)

# 3. Admin API freshness
curl -fsS -H "Authorization: Bearer $ADMIN_JWT" \
  http://localhost:4000/api/admin/backups/health | jq
```

## Out of scope (deferred)

- Restore API endpoint — too dangerous, runbook only.
- WAL archiving / PITR — **TD-17** when DB or user count warrants it.
- Automated monthly restore rehearsal — **TD-15**.
- Credential hardening beyond file-permissions — **TD-16**.
- Multi-region B2 replication.
