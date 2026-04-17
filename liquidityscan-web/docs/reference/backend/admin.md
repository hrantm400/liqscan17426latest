# Admin module

**Guard:** All routes use [`AdminGuard`](../../../backend/src/admin/guards/admin.guard.ts) — requires JWT **and** `user.isAdmin === true` **and** email in `ADMIN_EMAILS`.

## `AdminGuard`
**File:** [`backend/src/admin/guards/admin.guard.ts`](../../../backend/src/admin/guards/admin.guard.ts):6-50  

### `canActivate`
**Purpose:** Load user from DB by `request.user.userId`; verify both `isAdmin` flag and `isAdminEmail(email)` from env; else `ForbiddenException`.

---

## `AdminController`
**File:** [`backend/src/admin/admin.controller.ts`](../../../backend/src/admin/admin.controller.ts):17-206  
**Prefix:** `admin`

**Route groups:**

| Area | Methods (summary) |
|------|-------------------|
| Analytics | `GET analytics`, `GET dashboard` |
| Users | `GET users` (query: page, limit, search, grants), `GET users/:id`, `PUT users/:id`, `PUT users/:id/subscription`, `POST users/:id/extend`, `DELETE users/:id` |
| Features | `GET users/:id/features`, `POST users/:id/features`, `DELETE users/:id/features/:feature` |
| Categories | `GET/POST categories`, `PUT/DELETE categories/:id` |
| Payments | `GET payments` (filters), `PUT payments/:id/confirm`, `PUT payments/:id/cancel` |
| Email | `GET email-logs` |
| Comms | `POST broadcast` |
| Settings | `GET settings`, `PATCH settings/launch-promo`, `PATCH settings/cisd-config`, `POST settings/test-smtp` |

---

## `AdminService`
**File:** [`backend/src/admin/admin.service.ts`](../../../backend/src/admin/admin.service.ts):9-614  

### `getUsers`
**Purpose:** Paginated list with optional search on email/name; `grants=active|none` filters users with/without active `FeatureAccess` (non-expired).

### `getUserById`
**Purpose:** Full detail: subscription, alert subscriptions, recent userSubscriptions, recent payments.

### `updateUser`
**Purpose:** name, isAdmin; tier changes drive subscription status/expiry (FREE clears expiry; paid sets ~365 days admin grant pattern).

### `deleteUser`
**Purpose:** Hard delete user row (cascade per Prisma).

### `getUserFeatures` / `grantFeature` / `revokeFeature`
**Purpose:** Manage `FeatureAccess`; valid feature keys include `super_engulfing`, `ict_bias`, `rsi_divergence`, `crt`, `telegram_alerts`, `academy`, `tools`, `watchlist`, `all`.

### `getCategories` / `createCategory` / `updateCategory` / `deleteCategory`
**Purpose:** CRUD `Category`.

### `getAnalytics`
**Purpose:** Aggregate counts + recent users.

### `getDashboard`
**Purpose:** Extended stats, monthly revenue SQL (`$queryRaw`), recent payments/users, MRR estimate using `BASE_PRICE` env.

### `getPayments`
**Purpose:** Filtered paginated payments with user join.

### `confirmPayment`
**Purpose:** If pending, delegates to `PaymentsService.processSubscriptionPayment`.

### `cancelPayment`
**Purpose:** Set status `cancelled` if not completed.

### `setUserSubscription`
**Purpose:** Set tier FREE vs paid with expiry defaults.

### `extendUserSubscription`
**Purpose:** Add N days from current or now; bump tier from FREE to PAID_MONTHLY if needed.

### `getEmailLogs`
**Purpose:** Paginated `EmailLog` with filters.

### `broadcast`
**Purpose:** Loop users by tier filter; send email via `MailService` and/or Telegram DM via `TelegramService`.

### `getSettings`
**Purpose:** Merge `AppConfig`, env pricing, wallet addresses, SMTP config presence (not secrets).

### `setLaunchPromoFullAccess` / `setCisdConfig`
**Purpose:** Delegate to `AppConfigService`.

### `testSmtp`
**Purpose:** Send test HTML email to `to` or `SMTP_USER`.
