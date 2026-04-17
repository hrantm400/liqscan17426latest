# Affiliate module

## `AffiliateService`
**File:** [`backend/src/affiliate/affiliate.service.ts`](../../../backend/src/affiliate/affiliate.service.ts):15+  

### `createAffiliate`
**Purpose:** Create `Affiliate` row with unique `code`; sync `user.affiliateCode`.

### `trackReferral`
**Purpose:** On registration with `referralCode`, create `AffiliateReferral` (REGISTERED), set `user.referrerId`.

### `creditCommission`
**Purpose:** Update referral commission (also invoked from `PaymentsService.processSubscriptionPayment` with inline rates).

### `generateUniqueCode` / dashboard helpers
**Purpose:** Code generation and affiliate stats — see remainder of file.

## `AffiliateController`
**File:** [`backend/src/affiliate/affiliate.controller.ts`](../../../backend/src/affiliate/affiliate.controller.ts)  
**Purpose:** Authenticated routes for affiliate dashboard (code, referrals, earnings).

**Commission rates:** `STANDARD` 30%, `ELITE` 40%, `AGENCY` 20% (see constants in service).
