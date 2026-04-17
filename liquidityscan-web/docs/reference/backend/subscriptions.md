# Subscriptions module

## `SubscriptionsService`
**File:** [`backend/src/subscriptions/subscriptions.service.ts`](../../../backend/src/subscriptions/subscriptions.service.ts)  

### `findAll`
**Purpose:** Active catalog rows ordered by `sortOrder`.

### `findOnePublicCatalog` / `findOne`
**Purpose:** Single plan; public vs admin (with `_count.users`).

### `create` / `update` / `remove`
**Purpose:** Admin CRUD; validates tiers (`SCOUT`, `FULL_ACCESS` per current code).

**Notes:** See [`subscriptions.controller.ts`](../../../backend/src/subscriptions/subscriptions.controller.ts) for HTTP routes and guards.

---

## `SubscriptionReminderService`
**File:** [`backend/src/subscriptions/subscription-reminder.service.ts`](../../../backend/src/subscriptions/subscription-reminder.service.ts):13+  

### `cronSendRenewalReminders`
**Schedule:** `@Cron('0 10 * * *')` — daily 10:00  
**Purpose:** Find users with `subscriptionStatus: active` and `subscriptionExpiresAt` between now and +3 days; send renewal reminders via `MailService` and/or `TelegramService` (see file for templates).
