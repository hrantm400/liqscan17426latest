# Payments module

## `PaymentsController`
**File:** [`backend/src/payments/payments.controller.ts`](../../../backend/src/payments/payments.controller.ts):7-137  

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `nowPaymentsWebhook` | POST `payments/nowpayments-webhook` | Public | Header `x-nowpayments-sig`; `handleNowPaymentsWebhook` |
| `createPayment` | POST `payments/create` | JWT | Body amount, currency, subscriptionId, metadata |
| `getPaymentStatus` | GET `payments/status/:id` | JWT | Owner check |
| `startCustomPaymentSession` | POST `payments/start` | JWT | Body `{ network: TRC20 \| BEP20 }` → `startPayment` |
| `getCustomSessionStatus` | GET `payments/session-status` | JWT | Latest pending payment in 15m |
| `updatePaymentStatus` | PUT `payments/status/:id` | JWT | Owner check |
| `getMyPayments` | GET `payments/my-payments` | JWT | List user payments |
| `createSubscriptionPayment` | POST `payments/subscription/:subscriptionId` | JWT | Catalog plan checkout |
| `processSubscriptionPayment` | POST `payments/process-subscription/:paymentId` | JWT | Manual completion trigger |

---

## `PaymentsService`
**File:** [`backend/src/payments/payments.service.ts`](../../../backend/src/payments/payments.service.ts):9-457  

### `createPayment`
**Purpose:** Generate unique USDT amount (cent increments) among recent pending same-method payments; set expiry from `PAYMENT_TIMEOUT_MINUTES`; store wallet in metadata; create `Payment` row.

### `startPayment`
**Purpose:** Resolve `FULL_ACCESS` subscription from DB; price first month vs recurring from `FIRST_MONTH_PRICE` / `BASE_PRICE`; call `createPayment` with TRC20/BEP20 method.

### `createSubscriptionPayment`
**Purpose:** Generic subscription checkout by id (monthly vs annual amount).

### `processSubscriptionPayment`
**Purpose:** Validate pending payment; compute annual vs monthly duration; set user `tier`, `subscriptionStatus`, `subscriptionExpiresAt`; create `UserSubscription`; affiliate commission path; `sendPaymentNotificationEmails`.

### `getPaymentStatus` / `getUserPayments` / `updatePaymentStatus`
**Purpose:** CRUD helpers.

### `verifyNowPaymentsIpnSignature` / `handleNowPaymentsWebhook`
**Purpose:** HMAC-SHA512 sorted JSON body vs `NOWPAYMENTS_IPN_SECRET`; map statuses to `processSubscriptionPayment` or failed.

### `sendPaymentNotificationEmails` (private)
**Purpose:** User confirmation + broadcast to `ADMIN_EMAILS`.

---

## `TronScannerService`
**File:** [`backend/src/payments/tron-scanner.service.ts`](../../../backend/src/payments/tron-scanner.service.ts):8+  

**Purpose:** Cron every **20 seconds** scans pending `crypto_trc20` / `crypto_bep20` payments (last 15 minutes); calls chain-specific checkers from `lib/payments`; on match calls `processSubscriptionPayment`. Expires overdue pending rows.

### `onModuleInit`
**Purpose:** Log wallet env presence.

### `scanForPayments`
**Purpose:** Main cron body (see source for TRC20/BEP20 branching).

---

## `lib/payments`

### `types`
**File:** [`backend/src/lib/payments/types.ts`](../../../backend/src/lib/payments/types.ts)  
**Purpose:** Shared types (e.g. `Network`).

### `check-payment-trc20` / `check-payment-bep20`
**Files:** [`check-payment-trc20.ts`](../../../backend/src/lib/payments/check-payment-trc20.ts), [`check-payment-bep20.ts`](../../../backend/src/lib/payments/check-payment-bep20.ts)  
**Purpose:** Verify on-chain transfer amount to configured wallet matches pending payment (implementation details in files).

### `index`
**File:** [`backend/src/lib/payments/index.ts`](../../../backend/src/lib/payments/index.ts)  
**Purpose:** Re-export types and checkers.
