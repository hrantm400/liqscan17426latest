# Database reference (Prisma / PostgreSQL)

**Source:** [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma)

## Enums

### `SignalStatus`
- `PENDING`, `ACTIVE`, `COMPLETED`, `EXPIRED`, `ARCHIVED` — used on `SuperEngulfingSignal.lifecycleStatus` and related signal lifecycle.

### `SignalResult`
- `WIN`, `LOSS` — outcome on closed signals where applicable.

---

## Models — field summary and primary consumers

### `User` → table `users`
**Fields (high level):** `id` (uuid), `email` (unique), `name`, `password`, `googleId` (unique), `avatar`, `isAdmin`, `telegramId` (unique), `subscriptionId` → `Subscription`, `subscriptionExpiresAt`, `subscriptionStatus`, `timezone`, `tier` (`FREE` | `PAID_MONTHLY` | `PAID_ANNUAL`), `dailyRsiUsed`, `dailyBiasUsed`, `dailyQuotaResetAt`, `referrerId`, `affiliateCode` (unique), timestamps.

**Relations:** `payments`, `refreshTokens`, `userSubscriptions`, `alertSubscriptions`, `affiliate`, `featureAccess`, `oauthCodes`.

**Read/write:** `AuthService`, `UsersService`, `AdminService`, `PaymentsService`, `SubscriptionsService`, `AlertsService`, `AffiliateService`, `PricingService`, lifecycle/scanner code for quotas.

---

### `OAuthAuthorizationCode` → `oauth_authorization_codes`
One-time codes for OAuth redirect → token exchange (`POST /auth/oauth/exchange`).

**Indexes:** `code`

**Write:** `AuthService.createOAuthExchangeCode`, `exchangeOAuthCode`

---

### `RefreshToken` → `refresh_tokens`
JWT refresh tokens with `expiresAt`.

**Write:** `AuthService.generateTokens`, `refreshToken` (deletes old row on refresh)

---

### `AlertSubscription` → `alert_subscriptions`
Per-user per-symbol per-strategy Telegram alert prefs: `symbol`, `strategyType`, `timeframes` (Json), `directions` (Json), `minWinRate` (reserved), `isActive`.

**Unique:** `[userId, symbol, strategyType]`

**Read/write:** `AlertsService`, admin user detail views

---

### `TelegramLinkCode` → `telegram_link_codes`
Deep-link codes for `t.me/bot?start=link_CODE`.

**Index:** `userId`

---

### `Category` → `categories`
Content categories: `name`, `slug` (unique), `description`, `icon`, `order`.

**Admin:** `AdminService` CRUD

---

### `Subscription` → `subscriptions`
Product plans: `tier` (e.g. SCOUT, APPRENTICE, … in schema comments), `tierNumber`, prices, `duration`, JSON caps (`markets`, `pairsLimit`, `timeframes`, `signalTypes`, `features`, `limits`), flags.

**Relations:** `users`, `courses`, `chapterSubscriptions`, `userSubscriptions`

**Read:** `SubscriptionsService`, `PaymentsService`, frontend pricing

---

### `Payment` → `payments`
`userId`, optional `subscriptionId`, `amount`, `currency`, `status`, `paymentMethod`, external `paymentId`, `paymentUrl`, `metadata` (json).

**Write:** `PaymentsService`, admin confirm/cancel, NOWPayments webhook

---

### `EmailLog` → `email_logs`
`to`, `subject`, `template`, `status`, `error`, `sentAt`

**Indexes:** `sentAt`, `status`

**Write:** `MailService.sendMail` (success/failure rows)

---

### `UserSubscription` → `user_subscriptions`
Historical subscription periods: `startDate`, `endDate`, `status`, optional `paymentId`.

**Write:** `PaymentsService.processSubscriptionPayment`

---

### `Course` → `courses`
`title`, `description`, `coverUrl`, `difficulty`, `price`, `isFree`, optional `subscriptionId`

**Relations:** `chapters`

**Read/write:** `CoursesService`, admin

---

### `Chapter` → `chapters`
Belongs to `Course`; `lessons`, `chapterSubscriptions`

---

### `ChapterSubscription` → `chapter_subscriptions`
Links `Chapter` to required `Subscription` tier.

**Unique:** `[chapterId, subscriptionId]`

---

### `Lesson` → `lessons`
`videoUrl`, `videoProvider`, ordering under `Chapter`

---

### `SuperEngulfingSignal` → `super_engulfing_signals`
**Primary table for scanner-produced signals** (not only SE — strategy types include RSI, CISD, CRT, etc. per `strategyType` field). Large schema: lifecycle, legacy SE fields, SE v2 (`state`, `pattern_v2`, TP/SL ladder), ICT bias columns, indexes on `strategyType`, `symbol`, `timeframe`, `status`.

**Read/write:** `SignalsService`, `LifecycleService`, `SignalStateService`, `PositionTrackerService`, Prisma raw queries in scanners

**Indexes:** `[strategyType, detectedAt desc]`, `[strategyType, symbol, timeframe]`, `[status]`

---

### `Affiliate` → `affiliates`
`userId` (unique), `code` (unique), `tier`, `totalSales`, `totalEarned`, `cookieDays`, `isActive`

**Relations:** `referrals`, `payouts`

---

### `AffiliateReferral` → `affiliate_referrals`
`referredUserId` (unique), `paymentAmount`, `commission`, `status`

**Write:** `PaymentsService` on completed payment (commission); `AffiliateService` registration

---

### `AffiliatePayout` → `affiliate_payouts`
Payout records: `amount`, `currency`, `network`, `walletAddr`, `txHash`, `status`

---

### `FeatureAccess` → `feature_access`
Per-user feature grants: `feature` string, optional `expiresAt`, `grantedBy`

**Unique:** `[userId, feature]`

**Admin:** grant/revoke; **read:** `PricingService` / gating

---

### `AppConfig` → `app_config`
**Singleton** `id = "singleton"`: `launchPromoFullAccess`, `cisdPivotLeft`, `cisdPivotRight`, `cisdMinConsecutive`

**Read/write:** `AppConfigService`, CISD scanner (pivot params), admin settings

---

### `CandleSnapshot` → `candle_snapshots`
`symbol`, `interval`, `candles` (Json blob), `updatedAt`

**Unique:** `[symbol, interval]`

**Write:** `CandleFetchJob` / `CandleSnapshotService` for bulk cached klines

---

## Cross-reference: module → tables

| Module | Primary tables |
|--------|----------------|
| Auth | `User`, `RefreshToken`, `OAuthAuthorizationCode` |
| Users | `User` |
| Admin | Most tables (users, payments, categories, email_logs, feature_access via service) |
| Payments | `Payment`, `User`, `Subscription`, `UserSubscription`, `AffiliateReferral`, `Affiliate` |
| Subscriptions | `Subscription`, `UserSubscription` |
| Courses | `Course`, `Chapter`, `Lesson`, `ChapterSubscription` |
| Alerts | `AlertSubscription`, `User`, `TelegramLinkCode` |
| Signals / Lifecycle | `SuperEngulfingSignal` |
| Affiliate | `Affiliate`, `AffiliateReferral`, `AffiliatePayout`, `User` |
| Candles | `CandleSnapshot` (optional persistence path) |
| Mail | `EmailLog` |
| AppConfig | `AppConfig` |
