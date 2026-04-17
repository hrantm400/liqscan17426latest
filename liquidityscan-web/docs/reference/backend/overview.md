# Backend overview — bootstrap and app shell

## `bootstrap`
**File:** [`backend/src/main.ts`](../../../backend/src/main.ts):6-56  
**Kind:** async function  
**Signature:** `async function bootstrap(): Promise<void>`

**Purpose:** Create Nest app, configure security headers, CORS, API prefix, validation, start HTTP server.

**Inputs:** Environment variables (`FRONTEND_URL`, `HELMET_CSP`, `PORT`, `LISTEN_HOST`).

**Outputs / Side effects:** Listens on `host:port`; logs startup URL.

**Key logic:**
1. `NestFactory.create(AppModule)`.
2. `helmet()` with optional CSP; `crossOriginResourcePolicy: cross-origin`.
3. `enableCors({ origin: allowedOrigins, credentials: true })`.
4. `setGlobalPrefix('api')`.
5. `useGlobalPipes(ValidationPipe({ whitelist, forbidNonWhitelisted, transform }))`.
6. `app.listen(port, host)`.

---

## `AppModule`
**File:** [`backend/src/app.module.ts`](../../../backend/src/app.module.ts):26-64  
**Kind:** NestJS `@Module` class  

**Purpose:** Root module: config, throttling, scheduling, and all feature modules.

**Imports:** `ConfigModule.forRoot({ isGlobal, envFilePath: '.env' })`, `ThrottlerModule` (60s TTL, 120 limit), `ScheduleModule.forRoot()`, `PrismaModule`, `AuthModule`, `UsersModule`, `AdminModule`, `PaymentsModule`, `CoursesModule`, `SubscriptionsModule`, `CandlesModule`, `SignalsModule`, `TelegramModule`, `AlertsModule`, `PricingModule`, `AffiliateModule`, `RealtimeModule`, `MailModule`, `AppConfigModule`.

**Providers:** `AppService`; `APP_GUARD` → `JwtAuthGuard` (global JWT except `@Public()`).

---

## `AppController`
**File:** [`backend/src/app.controller.ts`](../../../backend/src/app.controller.ts):7-93  
**Kind:** NestJS `@Controller()` — **entire controller `@Public()`**

### `getHello`
**Signature:** `getHello(): string`  
**Route:** `GET /api`  
**Purpose:** Health string from `AppService`.

### `getHealth`
**Signature:** `getHealth(): { status, timestamp }`  
**Route:** `GET /api/health`

### `getPublicSiteStatus`
**Signature:** `async getPublicSiteStatus()`  
**Route:** `GET /api/public/site-status`  
**Purpose:** Returns `AppConfigService.getConfig()` (launch promo, CISD pivot settings).

### `getCmcRanks`
**Signature:** `async getCmcRanks()`  
**Route:** `GET /api/cmc/ranks`  
**Guards:** `ThrottlerGuard` — 40/min  
**Purpose:** Proxy to CoinMarketCap Pro API; **15-minute in-memory cache**; maps listings to `{ id, symbol, name, market_cap_rank }`. Requires `CMCAPIKEY`.

**Notes:** Private fields `cachedCmcData`, `lastFetchTime`, `CMC_CACHE_TTL` on controller instance.

---

## `AppService`
**File:** [`backend/src/app.service.ts`](../../../backend/src/app.service.ts):4-8  
**Kind:** `@Injectable` class  

### `getHello`
**Signature:** `getHello(): string`  
**Returns:** `'LiquidityScan API is running!'`
