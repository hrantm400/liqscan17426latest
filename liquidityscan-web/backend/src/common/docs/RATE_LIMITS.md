# Rate limits

Source-of-truth for all `@nestjs/throttler` rate limits enforced by
the backend. When you add, change, or remove a `@Throttle` decorator,
update this file in the same commit — CI does not auto-verify this,
it is an intentional eyeball.

## Storage backend

In-memory (single-instance). When we scale to multiple API replicas,
switch to a Redis-backed `ThrottlerStorageService` — tracked as a
separate tech-debt item.

## Named windows (from `app.module.ts`)

| Name | Limit | Window | Purpose |
|---|---|---|---|
| `default` | 120 | 60s | Global safety net — applied everywhere |
| `strict` | 10 | 60s | Short-window override for sensitive routes |
| `burst` | 5 | 300s | Long-window override for abuse-prone blasts |

Per-route `@Throttle({ <name>: { limit, ttl } })` overrides the named
window for that route only. `ThrottlerGuard` evaluates every named
throttler, so `default` still applies to every route.

## Trackers

- `ThrottlerGuard` (from `@nestjs/throttler`) — buckets by IP.
- `UserThrottlerGuard` (our subclass, `common/throttler/user-throttler.guard.ts`)
  — buckets by `req.user.userId` when the request is authenticated,
  falls back to `req.ip` otherwise. Trackers are namespaced with
  `user:` / `ip:` prefixes so the two axes cannot collide.

## Per-route table

| Endpoint | Method | Limit | Window | Tracker | Rationale |
|---|---|---|---|---|---|
| `/auth/register` | POST | 3 | 60s | IP | account-creation spam |
| `/auth/login` | POST | 5 | 60s | IP | credential brute-force (GitHub-class) |
| `/auth/refresh` | POST | 60 | 60s | IP | silent refresh is 1/h per tab; 60 covers 60 parallel tabs |
| `/auth/logout` | POST | 20 | 60s | IP | logout storms are benign but finite |
| `/auth/google/one-tap` | POST | 10 | 60s | IP | OAuth brute-force guard |
| `/auth/oauth/exchange` | POST | 10 | 60s | IP | one-time-code replay guard |
| `/payments/create` | POST | 10 | 60s | user | payment-session spam |
| `/payments/start` | POST | 10 | 60s | user | Tron/BEP20 session spam |
| `/payments/status/:id` | GET | 60 | 60s | user | status polling — 1/s cap |
| `/payments/status/:id` | PUT | 20 | 60s | user | status overwrites |
| `/payments/subscription/:subscriptionId` | POST | 20 | 60s | user | subscription-payment creation |
| `/payments/process-subscription/:paymentId` | POST | 20 | 60s | user | silent retries permitted |
| `/admin/users/:id` | PUT | 30 | 60s | user | generic admin mutations |
| `/admin/users/:id` | DELETE | 30 | 60s | user | |
| `/admin/users/:id/subscription` | PUT | 30 | 60s | user | |
| `/admin/users/:id/extend` | POST | 30 | 60s | user | |
| `/admin/users/:id/features` | POST | 30 | 60s | user | feature grant |
| `/admin/users/:id/features/:feature` | DELETE | 30 | 60s | user | feature revoke |
| `/admin/categories` | POST | 30 | 60s | user | |
| `/admin/categories/:id` | PUT | 30 | 60s | user | |
| `/admin/categories/:id` | DELETE | 30 | 60s | user | |
| `/admin/payments/:id/confirm` | PUT | 20 | 60s | user | money mutation |
| `/admin/payments/:id/cancel` | PUT | 20 | 60s | user | money mutation |
| `/admin/payments/:id/refund` | PUT | 20 | 60s | user | money mutation + refund rollback hot path |
| `/admin/broadcast` | POST | 5 | 300s | user | mass-email/telegram blast — room for iterate-fix-resend |
| `/admin/settings/launch-promo` | PATCH | 10 | 60s | user | |
| `/admin/settings/cisd-config` | PATCH | 10 | 60s | user | |
| `/admin/settings/test-smtp` | POST | 5 | 300s | user | SMTP-send abuse guard |
| `/signals/ict-bias` | POST | 60 | 60s | IP | heavy compute DoS guard |
| `/debug/throw-sentry` | POST | 1 | 3600s | user | Sentry quota guard |

Anything not listed here falls back to the global `default` throttler
(120/60s IP).

## Out of scope

- Redis-backed throttler storage (needed only for multi-instance).
- CAPTCHA on auth endpoints (considered for Phase 4).
- Cloudflare/WAF-layer rate limiting (external layer).

## Verification recipes

### Brute-force login

```sh
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code} " \
    -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"rate@test","password":"x"}'
done
# Expected: 401 401 401 401 401 429 429 429 429 429
```

### Admin refund flood (requires admin JWT)

```sh
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code} " \
    -X PUT http://localhost:4000/api/admin/payments/fake_id/refund \
    -H "Authorization: Bearer $ADMIN_JWT"
done
# Expected: first 20 return 404 (fake id), then 429
```
