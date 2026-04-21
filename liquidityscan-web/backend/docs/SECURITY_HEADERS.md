# Security Headers — PR 3.5

Browser-enforced Content-Security-Policy and companion security headers
applied in **two layers** across nginx (HTML document) and NestJS Helmet
(API + Socket.IO). Rolled out in **two stages**: Report-Only → Enforcing.

## Why two layers

The HTML document at `https://liquidityscan.io/` is served by nginx
directly from `/var/www/liquidityscan-app/liquidityscan-web/frontend/dist`.
Only `/api/*` and `/socket.io/*` are proxied to the NestJS backend. CSP
is enforced by the browser against the **document's response headers**,
not subresources — so CSP on API JSON responses alone would not protect
the page that loads all the third-party scripts.

- **Layer 1 — nginx.** Source of truth for CSP and the full security
  header set on the HTML root + static assets. This is what
  securityheaders.com grades and what actually mitigates XSS.
- **Layer 2 — Helmet (NestJS).** Applies the same header set to API +
  Socket.IO responses for defense in depth.

When editing the CSP origin whitelist, **keep both layers in sync**:
- nginx: `/etc/nginx/snippets/liquidityscan-security-headers.conf`
- Helmet: `cspDirectives` in
  [`liquidityscan-web/backend/src/main.ts`](../src/main.ts).

## Header set (Stage 2 / enforcing)

| Header | Value | Set by |
| --- | --- | --- |
| `Content-Security-Policy` | see directives below | nginx + Helmet |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (1 year) | nginx + Helmet |
| `X-Frame-Options` | `DENY` | nginx + Helmet (`frameguard: deny`) |
| `X-Content-Type-Options` | `nosniff` | nginx + Helmet |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | nginx + Helmet |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()` | nginx + Helmet (custom middleware) |
| `Cross-Origin-Opener-Policy` | `same-origin` | nginx + Helmet |
| `Cross-Origin-Resource-Policy` | `cross-origin` | nginx + Helmet |
| `Origin-Agent-Cluster` | `?1` | nginx + Helmet |

`Cross-Origin-Resource-Policy` is deliberately kept at `cross-origin`
(not the Helmet default `same-origin`) because tightening it can break
cross-origin subresource loads for the frontend without a clear win at
our current topology.

## CSP directives

Applied in both nginx and Helmet. The two must stay in sync.

```
default-src 'self';
script-src 'self' 'unsafe-inline'
  https://accounts.google.com https://apis.google.com
  https://www.googletagmanager.com https://www.google-analytics.com
  https://www.clarity.ms;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: https: blob:;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self'
  https://liquidityscan.io wss://liquidityscan.io
  https://*.ingest.de.sentry.io
  https://accounts.google.com https://oauth2.googleapis.com
  https://www.google-analytics.com https://region1.google-analytics.com
  https://*.clarity.ms;
frame-src 'self' https://accounts.google.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

### Origin rationale

- `accounts.google.com`, `apis.google.com`, `oauth2.googleapis.com` —
  Google OAuth GSI client + token exchange (`Login.tsx`, `Register.tsx`).
- `www.googletagmanager.com`, `www.google-analytics.com`,
  `region1.google-analytics.com` — GTM snippet in `frontend/index.html`
  plus analytics beacons it fires.
- `www.clarity.ms`, `*.clarity.ms` — Microsoft Clarity (`lib/clarity.ts`)
  script + beacon domains (Clarity load-balances beacons across regional
  subdomains).
- `*.ingest.de.sentry.io` — Sentry frontend DSN host (PR 3.2).
- `fonts.googleapis.com`, `fonts.gstatic.com` — Google Fonts imported
  from `frontend/src/index.css`.
- `wss://liquidityscan.io` — Socket.IO transport. `'self'` matches
  `https://liquidityscan.io` but NOT `wss://`, so it must be listed
  explicitly.
- `'unsafe-inline'` on script-src and style-src — required for the
  inline GTM bootstrap in `frontend/index.html` and the inline `<style>`
  in `components/shared/AnimatedLogo.tsx`. React's
  `style={{...}}` props are applied via DOM API and do NOT require
  `'unsafe-inline'`.
- `'unsafe-eval'` is **omitted** from script-src. Vite production builds
  do not emit `eval()`, but some charting or runtime-compilation
  libraries can. Stage 1 observation must watch for
  `Refused to evaluate a string as JavaScript` violations — if present,
  add `'unsafe-eval'` to scriptSrc in both layers before Stage 2.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY` are redundant on
  purpose — legacy browsers honour only the latter.
- `upgrade-insecure-requests` upgrades any stray `http://` subresource
  to `https://` transparently.

## Two-stage rollout

### Stage 1 — Report-Only (first deploy)

Backend (`.env`):

```
HELMET_CSP_MODE=report-only
```

Then `pm2 restart liquidityscan-api --update-env`.

nginx — include snippet emits
`Content-Security-Policy-Report-Only` header. Browser logs violations
to DevTools Console without blocking anything.

Observe **24 hours** before flipping. See **Stage 1 Manual Monitoring
Protocol** below.

### Stage 1 Manual Monitoring Protocol

There is no `report-uri` / `report-to` endpoint wired in Stage 1 (Sentry
Relay CSP ingestion is out of scope). Violations only appear in the
browser console of each individual user session, so manual sampling is
the only signal.

**Cadence for the first 24h after Stage 1 goes live:** every 4–6 hours,
run this drill.

1. Open `https://liquidityscan.io` in a **fresh incognito** window
   (incognito avoids cached service workers, logged-in state, and stale
   CSP decisions).
2. Open DevTools → Console.
3. Filter for any of:
   - `Content Security Policy`
   - `Refused to`
   - `CSP`
   - `violates the following`
   - `Refused to evaluate a string as JavaScript` — **specifically
     watch for this**; indicates an `'unsafe-eval'` miss and is a
     blocker for Stage 2.
4. Exercise the full critical path:
   - Hit the landing page (lets GTM/Clarity load).
   - Sign in with Google OAuth.
   - Navigate across dashboard routes that load charts, signals, and
     websocket updates.
   - Hit a monitor page (bias, CRT, 3-OB, CISD) to trigger the WS.
   - Log out.
5. Screenshot every violation. Log to the tracking checklist with:
   - Timestamp.
   - Blocked resource URL.
   - Violated directive (e.g. `script-src`, `connect-src`).
   - Which page triggered it.

Maintain the running list in this PR's issue / Slack thread. At the
24h mark:

- **Zero violations** → ready to flip to Stage 2.
- **Only anticipated violations** (e.g. an origin we forgot to
  whitelist) → patch both snippets, redeploy, re-enter Stage 1
  observation for another 24h.
- **`Refused to evaluate a string as JavaScript` present** → add
  `'unsafe-eval'` to scriptSrc in BOTH layers before Stage 2.

Do **not** proceed to Stage 2 with open violations. Stage 2 turns each
one into a broken feature.

### Stage 2 — Enforcing (follow-up config flip, no PR)

Backend (`.env`):

```
HELMET_CSP_MODE=enforce
```

Then `pm2 restart liquidityscan-api --update-env`.

nginx — edit
`/etc/nginx/snippets/liquidityscan-security-headers.conf`:
comment the `Content-Security-Policy-Report-Only` line, uncomment the
`Content-Security-Policy` line, then `sudo nginx -t && sudo systemctl
reload nginx`.

Observe a second 24h. Any violation is now a broken feature — rollback
(below) and fix.

## nginx install runbook

### Files to create / edit

1. **Create** `/etc/nginx/snippets/liquidityscan-security-headers.conf`
   with the content in `## nginx snippet` below.
2. **Edit** `/etc/nginx/sites-available/liquidityscan.io` to add
   `include snippets/liquidityscan-security-headers.conf;` inside three
   `location` blocks: `= /index.html`, `~* \.(js|css|woff2?|...)$`,
   and `/`. Due to nginx's `add_header` inheritance rule (inner blocks
   hide outer blocks' add_headers), the include must appear in every
   location that serves a response the browser loads as a document or
   asset.

### Apply commands (SSH)

```bash
# 1. Backup current config
sudo cp /etc/nginx/sites-available/liquidityscan.io \
        /etc/nginx/sites-available/liquidityscan.io.pre-PR3.5.bak

# 2. Create snippet
sudo mkdir -p /etc/nginx/snippets
sudo nano /etc/nginx/snippets/liquidityscan-security-headers.conf
#   paste the snippet from this doc, save

# 3. Edit site config — add three `include` lines (see unified diff)
sudo nano /etc/nginx/sites-available/liquidityscan.io

# 4. Validate BEFORE reload — if this fails, DO NOT reload
sudo nginx -t

# 5. Reload (zero-downtime, no request drop)
sudo systemctl reload nginx

# 6. Verify Stage 1 headers live
curl -sI https://liquidityscan.io/ | grep -i 'content-security-policy\|strict-transport\|x-frame\|referrer-policy\|permissions-policy'
curl -sI https://liquidityscan.io/api/health | grep -i 'content-security-policy\|permissions-policy'
```

## nginx snippet

File: `/etc/nginx/snippets/liquidityscan-security-headers.conf`

```nginx
# PR 3.5 — security headers on the HTML document + static assets.
# Stage 1 (report-only) is active by default. Flip to Stage 2
# (enforcing) by commenting the Report-Only line and uncommenting the
# enforcing line below, then `sudo nginx -t && sudo systemctl reload nginx`.

add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "cross-origin" always;
add_header Origin-Agent-Cluster "?1" always;

# Stage 1 — Report-Only (active now).
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://www.googletagmanager.com https://www.google-analytics.com https://www.clarity.ms; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://liquidityscan.io wss://liquidityscan.io https://*.ingest.de.sentry.io https://accounts.google.com https://oauth2.googleapis.com https://www.google-analytics.com https://region1.google-analytics.com https://*.clarity.ms; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;

# Stage 2 — Enforcing (flip: comment the Report-Only line above, uncomment below).
# add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://www.googletagmanager.com https://www.google-analytics.com https://www.clarity.ms; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://liquidityscan.io wss://liquidityscan.io https://*.ingest.de.sentry.io https://accounts.google.com https://oauth2.googleapis.com https://www.google-analytics.com https://region1.google-analytics.com https://*.clarity.ms; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
```

## Site config edits

Three `include` lines to add to
`/etc/nginx/sites-available/liquidityscan.io`:

```nginx
location = /index.html {
    root /var/www/liquidityscan-app/liquidityscan-web/frontend/dist;
    include snippets/liquidityscan-security-headers.conf;   # ← ADD
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    try_files /index.html =404;
}

location ~* \.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$ {
    root /var/www/liquidityscan-app/liquidityscan-web/frontend/dist;
    include snippets/liquidityscan-security-headers.conf;   # ← ADD
    expires 30d;
    add_header Cache-Control "public, immutable" always;
    try_files $uri =404;
}

location / {
    root /var/www/liquidityscan-app/liquidityscan-web/frontend/dist;
    include snippets/liquidityscan-security-headers.conf;   # ← ADD
    try_files $uri $uri/ /index.html;
}
```

Note: the existing `Cache-Control` and `Pragma` directives are rewritten
with the `always` flag on Stage 1 apply. nginx's `add_header` only
applies to 200/201/204/301/302/303/304/307/308 responses by default;
`always` makes them apply to every status, which matches our security
posture expectations.

## Rollback

### Backend only (fastest — 15 s)

```bash
# Edit prod .env
HELMET_CSP_MODE=off
pm2 restart liquidityscan-api --update-env
```

Or full revert:
```bash
git revert <PR3.5-commit-sha>
cd liquidityscan-web/backend && npm run build
pm2 restart liquidityscan-api --update-env
```

### nginx only

```bash
sudo cp /etc/nginx/sites-available/liquidityscan.io.pre-PR3.5.bak \
        /etc/nginx/sites-available/liquidityscan.io
sudo nginx -t
sudo systemctl reload nginx
```

Either rollback takes under 2 minutes and requires no DB change, no
frontend rebuild, and no user session invalidation.

## Out of scope

- **CSP nonces** — tighter than `'unsafe-inline'` but require a Vite
  build plugin to inject per-response nonces into inline scripts. Track
  as follow-up tech debt if `'unsafe-inline'` becomes a blocker.
- **Subresource Integrity (SRI)** — only useful for CDN scripts we
  pin; the current third-party scripts (GTM, Clarity, Google GSI) are
  not versioned by URL, so SRI is impractical.
- **HSTS preload submission** (`hstspreload.org`) — requires sustained
  clean HSTS + `preload` directive for months; defer.
- **CSP `report-uri` / `report-to`** wired to Sentry Relay CSP ingestion
  — would remove the manual Stage 1 monitoring burden but requires
  separate Sentry config. See Stage 1 monitoring protocol for the
  manual approach.
- **Cloudflare Transform Rules for headers** — would duplicate nginx's
  work; one layer is enough. Kept at nginx because it's closer to the
  app and survives Cloudflare misconfiguration.
- **COEP (`Cross-Origin-Embedder-Policy: require-corp`)** — breaks
  third-party scripts that do not advertise CORP; not worth the
  regression risk at current topology.
