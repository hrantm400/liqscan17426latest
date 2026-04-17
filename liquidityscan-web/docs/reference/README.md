# LiquidityScan — Function-Level Project Reference

This directory contains **English** documentation of the **LiquidityScan** monorepo: NestJS API (`liquidityscan-web/backend`), React SPA (`liquidityscan-web/frontend`), and PostgreSQL schema (Prisma).

## How to read

- Each file uses a **uniform block** per symbol (function, class, controller route, React component, hook, store action): purpose, inputs/outputs, side effects, key logic, dependencies.
- **Line ranges** point to source files under `liquidityscan-web/` — use your editor to jump to exact code.

## Map of documents

| Document | Contents |
|----------|----------|
| [architecture.md](architecture.md) | Boot sequence, HTTP/WS flows, signal pipeline, auth, payments (diagrams). |
| [database.md](database.md) | Prisma models, enums, relations, which modules read/write each table. |
| [backend/overview.md](backend/overview.md) | `main.ts`, `AppModule`, global guards, `AppController`, `AppService`. |
| [backend/auth.md](backend/auth.md) | Auth module: JWT, Google OAuth, refresh, DTOs, guards, strategies. |
| [backend/users.md](backend/users.md) | Users profile + Telegram proxy routes. |
| [backend/admin.md](backend/admin.md) | Admin API: users, payments, features, broadcast, settings, CISD config. |
| [backend/mail.md](backend/mail.md) | Nodemailer + `EmailLog`. |
| [backend/app-config.md](backend/app-config.md) | Singleton `AppConfig` (launch promo, CISD pivots). |
| [backend/prisma.md](backend/prisma.md) | `PrismaService` lifecycle. |
| [backend/payments.md](backend/payments.md) | Crypto checkout, NOWPayments IPN, subscription activation, affiliate credit. |
| [backend/subscriptions.md](backend/subscriptions.md) | Catalog CRUD, reminders. |
| [backend/courses.md](backend/courses.md) | Courses/chapters/lessons API. |
| [backend/pricing.md](backend/pricing.md) | Tier/symbol access checks. |
| [backend/affiliate.md](backend/affiliate.md) | Referral codes, referrals, payouts. |
| [backend/candles.md](backend/candles.md) | Klines cache, Binance WS, snapshots, fetch job. |
| [backend/providers.md](backend/providers.md) | `BinanceProvider`, `CoinRayProvider`, `IExchangeProvider`. |
| [backend/realtime.md](backend/realtime.md) | Socket.IO gateway, JWT on connect, `candle:update` polling. |
| [backend/telegram.md](backend/telegram.md) | Bot messages, chart screenshots (Playwright). |
| [backend/alerts.md](backend/alerts.md) | Per-user strategy alerts + `strategy-alert-config`. |
| [backend/signals/overview.md](backend/signals/overview.md) | `SignalsService`, `ScannerService`, controller, persistence, lifecycle overview. |
| [backend/signals/rsi.md](backend/signals/rsi.md) | RSI math, divergence detection, scanner. |
| [backend/signals/cisd.md](backend/signals/cisd.md) | CISD detector + scanner. |
| [backend/signals/crt.md](backend/signals/crt.md) | CRT detector + scanner. |
| [backend/signals/3ob.md](backend/signals/3ob.md) | 3OB detector + scanner. |
| [backend/signals/ict-bias.md](backend/signals/ict-bias.md) | ICT bias detector + scanner. |
| [backend/signals/super-engulfing.md](backend/signals/super-engulfing.md) | SE v2, `se-runtime`, lifecycle hooks. |
| [frontend/overview.md](frontend/overview.md) | Vite entry, `App.tsx`, React Query, routing shell. |
| [frontend/routing-and-layout.md](frontend/routing-and-layout.md) | Layout, auth routes, OAuth handler. |
| [frontend/components.md](frontend/components.md) | Shared UI, charts, landing, animations, settings. |
| [frontend/services.md](frontend/services.md) | REST + WebSocket clients. |
| [frontend/stores.md](frontend/stores.md) | Zustand stores. |
| [frontend/hooks.md](frontend/hooks.md) | Custom hooks. |
| [frontend/contexts.md](frontend/contexts.md) | Theme context. |
| [frontend/utils.md](frontend/utils.md) | Helpers (CISD overlay, RSI strategy, timezones, etc.). |
| [frontend/types.md](frontend/types.md) | Shared TS types. |
| [frontend/pages/dashboard.md](frontend/pages/dashboard.md) | Dashboard page. |
| [frontend/pages/monitors.md](frontend/pages/monitors.md) | All monitor pages (RSI, CISD, CRT, 3OB, Bias, Super Engulfing). |
| [frontend/pages/signal-details.md](frontend/pages/signal-details.md) | Signal detail + chart. |
| [frontend/pages/watchlist.md](frontend/pages/watchlist.md) | Watchlist. |
| [frontend/pages/top-market-coins.md](frontend/pages/top-market-coins.md) | Top coins + CMC ranks. |
| [frontend/pages/subscriptions-and-payment.md](frontend/pages/subscriptions-and-payment.md) | Subscriptions, Payment, Profile, Settings. |
| [frontend/pages/courses-and-strategies.md](frontend/pages/courses-and-strategies.md) | Courses, strategies, tools, recap, risk, support. |
| [frontend/pages/affiliate.md](frontend/pages/affiliate.md) | Affiliate dashboard. |
| [frontend/pages/landing.md](frontend/pages/landing.md) | Landing + marketing components. |
| [frontend/pages/auth.md](frontend/pages/auth.md) | Login, Register. |
| [frontend/pages/admin.md](frontend/pages/admin.md) | All admin pages. |
| [frontend/pages/super-engulfing-game.md](frontend/pages/super-engulfing-game.md) | Interactive SE learning module. |

## Repository layout (high level)

```
liquidityscan-web/
  backend/          # NestJS API (prefix /api)
  frontend/         # Vite + React SPA
  docs/reference/   # This documentation tree
```

## Environment (not committed)

Key variables used across the stack: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`, `SMTP_*`, `CMCAPIKEY`, `BASE_PRICE`, `FIRST_MONTH_PRICE`, `TRC20_WALLET_ADDRESS` / `WALLET_BEP20`, `MARKET_SCANNER_ENABLED`, `NOWPAYMENTS_IPN_SECRET`, etc. See each module doc for specifics.
