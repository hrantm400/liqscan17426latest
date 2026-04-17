# Users module

## `UsersController`
**File:** [`backend/src/users/users.controller.ts`](../../../backend/src/users/users.controller.ts):5-48  
**Base path:** `GET /api/users` (with global prefix)

**Purpose:** Authenticated user profile and Telegram/alert proxy endpoints (some proxies mishandle `/alerts/*`).

| Method | Route | Purpose |
|--------|-------|---------|
| `getProfile` | GET `users/me` | `UsersService.findById(req.user.userId)` |
| `updateProfile` | PUT `users/me` | Body `{ name?, avatar?, timezone? }` |
| `getTelegramId` | GET `users/me/telegram` | Delegates to `AlertsService.getTelegramId` |
| `saveTelegramId` | POST `users/me/telegram` | Body `{ telegramId }` → `AlertsService.saveTelegramId` |
| `createTelegramDeepLink` | POST `users/me/telegram/link` | `AlertsService.createTelegramDeepLink` |
| `unlinkTelegram` | POST `users/me/telegram/unlink` | `AlertsService.clearTelegramId` |
| `getAlertStrategyOptions` | GET `users/me/alert-strategy-options` | Same payload as alerts strategy-options |

---

## `UsersService`
**File:** [`backend/src/users/users.service.ts`](../../../backend/src/users/users.service.ts):5-47  

### `findById`
**Signature:** `async findById(id: string)`  
**Purpose:** Load user with `subscription` relation; throw `NotFoundException` if missing.

### `updateProfile`
**Signature:** `async updateProfile(userId: string, data: { name?, avatar?, timezone? })`  
**Purpose:** Partial update; returns selected safe fields.
