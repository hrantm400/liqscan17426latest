# App config service

## `AppConfigService`
**File:** [`backend/src/app-config/app-config.service.ts`](../../../backend/src/app-config/app-config.service.ts):7-66  
**Kind:** `@Injectable` class  
**Constant:** `SINGLETON_ID = 'singleton'`

**Purpose:** Read/update singleton `AppConfig` row (launch promo flag, CISD scanner pivot parameters).

### `ensureRow`
**Signature:** `async ensureRow(): Promise<void>`  
**Purpose:** Upsert `AppConfig` with `id = singleton` so reads never miss defaults.

### `getConfig`
**Signature:** `async getConfig(): Promise<{ launchPromoFullAccess, cisdPivotLeft, cisdPivotRight, cisdMinConsecutive }>`  
**Purpose:** Load singleton; default CISD fields to 5, 2, 2 if null.

### `getLaunchPromoFullAccess`
**Signature:** `async getLaunchPromoFullAccess(): Promise<boolean>`  
**Purpose:** Convenience wrapper.

### `setLaunchPromoFullAccess`
**Signature:** `async setLaunchPromoFullAccess(enabled: boolean): Promise<void>`  
**Purpose:** Admin toggles full-access promo for product launch.

### `setCisdConfig`
**Signature:** `async setCisdConfig(data: { cisdPivotLeft, cisdPivotRight, cisdMinConsecutive }): Promise<void>`  
**Purpose:** Persist CISD pivot/consecutive settings used by CISD scanner (fetched at runtime).

**Notes:** Class declares `cache` / `CACHE_MS` fields; `getConfig` currently reads Prisma on each call (no RAM cache in the shown implementation).
