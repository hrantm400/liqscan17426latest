# Pages: Subscriptions, payment, profile, settings

| File | Route | Purpose |
|------|-------|---------|
| [`Subscriptions.tsx`](../../../../frontend/src/pages/Subscriptions.tsx) | `/subscription`, `/subscriptions` | Pricing tiers, upgrade CTAs, `SubscriptionCard` components |
| [`Payment.tsx`](../../../../frontend/src/pages/Payment.tsx) | `/payment/:id` | Pending payment status, wallet address, countdown from metadata |
| [`Profile.tsx`](../../../../frontend/src/pages/Profile.tsx) | `/profile` | User profile edit |
| [`Settings.tsx`](../../../../frontend/src/pages/Settings.tsx) | `/settings` | Timezone, Telegram alerts (`TelegramAlertsConfig`), preferences |

**API:** `ApiClient` / payments endpoints in [`userApi`](../services.md) for session checkout and status polling.
