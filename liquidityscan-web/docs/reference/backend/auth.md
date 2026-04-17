# Auth module

**Files:** [`backend/src/auth/`](../../../backend/src/auth/)

## DTOs

### `RegisterDto`
**File:** [`backend/src/auth/dto/register.dto.ts`](../../../backend/src/auth/dto/register.dto.ts):3-18  
**Fields:** `email` (Email), `password` (min 6), optional `name`, optional `referralCode` (validated but referral handling may live elsewhere — check `AuthService.register`).

### `LoginDto`
**File:** [`backend/src/auth/dto/login.dto.ts`](../../../backend/src/auth/dto/login.dto.ts):3-9  
**Fields:** `email`, `password`.

### `OAuthExchangeDto`
**File:** [`backend/src/auth/dto/oauth-exchange.dto.ts`](../../../backend/src/auth/dto/oauth-exchange.dto.ts)  
**Fields:** `code` — one-time OAuth exchange code.

---

## Decorators

### `Public`
**File:** [`backend/src/auth/decorators/public.decorator.ts`](../../../backend/src/auth/decorators/public.decorator.ts):6  
**Kind:** metadata decorator  
**Purpose:** Sets `IS_PUBLIC_KEY` so `JwtAuthGuard` skips JWT validation for that route/class.

---

## Guards

### `JwtAuthGuard`
**File:** [`backend/src/auth/guards/jwt-auth.guard.ts`](../../../backend/src/auth/guards/jwt-auth.guard.ts):7-32  
**Extends:** `AuthGuard('jwt')`  

### `canActivate`
**Purpose:** If route is not HTTP, return true. If `@Public()`, return true. Else delegate to JWT strategy.

### `handleRequest`
**Purpose:** Throw `UnauthorizedException` if no user; else return `user`.

### `GoogleOauthGuard`
**File:** [`backend/src/auth/guards/google-oauth.guard.ts`](../../../backend/src/auth/guards/google-oauth.guard.ts)  
**Purpose:** Passport guard for Google OAuth routes (see `AuthController`).

---

## Strategies

### `JwtStrategy`
**File:** [`backend/src/auth/strategies/jwt.strategy.ts`](../../../backend/src/auth/strategies/jwt.strategy.ts):7-27  
**Purpose:** Extract JWT from `Authorization: Bearer`, verify with `JWT_SECRET`.

### `validate`
**Signature:** `async validate(payload: any): Promise<{ userId; email }>`  
**Purpose:** Map `payload.sub` (or legacy `userId`/`id`) to `{ userId, email }` attached to request.

### `GoogleStrategy`
**File:** [`backend/src/auth/strategies/google.strategy.ts`](../../../backend/src/auth/strategies/google.strategy.ts):7-41  
**Purpose:** OAuth2 strategy `'google'` with `scope: ['email','profile']`, callback URL from `GOOGLE_CALLBACK_URL` or default localhost.

### `validate`
**Purpose:** Build user object for `syncGoogleUser` with `id`, `emails`, `displayName`, `photos`.

---

## `AuthService`
**File:** [`backend/src/auth/auth.service.ts`](../../../backend/src/auth/auth.service.ts):13-368  

### `isAdminEmail`
**Signature:** `private isAdminEmail(email: string): boolean`  
**Purpose:** True if `email` is in comma-separated `ADMIN_EMAILS` env (case-insensitive).

### `register`
**Signature:** `async register(dto: RegisterDto)`  
**Purpose:** Create user with bcrypt hashed password; set `isAdmin` from email list; return user subset + `generateTokens`.

### `login`
**Signature:** `async login(dto: LoginDto)`  
**Purpose:** Validate password; sync `isAdmin` from env; return user + tokens.

### `syncGoogleUser`
**Signature:** `async syncGoogleUser(profile: any): Promise<User>`  
**Purpose:** Find by `googleId` or link/create by email; update admin flag from env.

### `googleLogin`
**Signature:** `async googleLogin(profile: any)`  
**Purpose:** `syncGoogleUser` + `generateTokens` + user shape for API.

### `createOAuthExchangeCode`
**Signature:** `async createOAuthExchangeCode(userId: string): Promise<string>`  
**Purpose:** Random base64url code; store in `OAuthAuthorizationCode` with 5-minute expiry.

### `exchangeOAuthCode`
**Signature:** `async exchangeOAuthCode(code: string)`  
**Purpose:** Mark code used; return user + tokens or `UnauthorizedException`.

### `googleOneTapLogin`
**Signature:** `async googleOneTapLogin(credential: string)`  
**Purpose:** Verify Google ID token via `google-auth-library` + `GOOGLE_CLIENT_ID`; build profile; `googleLogin`.

### `validateUser`
**Signature:** `async validateUser(userId: string)`  
**Purpose:** Load user public fields; sync `isAdmin` from env list.

### `refreshToken`
**Signature:** `async refreshToken(refreshToken: string)`  
**Purpose:** Validate stored refresh token (Prisma); issue new access+refresh; delete old refresh row.

### `generateTokens` (private)
**Signature:** `private async generateTokens(userId: string, email: string)`  
**Purpose:** Sign access JWT (`JWT_SECRET`, expiry from `JWT_EXPIRES_IN`); sign refresh with `JWT_REFRESH_SECRET` and `JWT_REFRESH_EXPIRES_IN`; store refresh in `RefreshToken` (30-day expiry on row).

---

## `AuthController`
**File:** [`backend/src/auth/auth.controller.ts`](../../../backend/src/auth/auth.controller.ts):12-84  

| Method | Route | Public | Throttle | Purpose |
|--------|-------|--------|----------|---------|
| `register` | POST `auth/register` | yes | 10/min | Register |
| `login` | POST `auth/login` | yes | 15/min | Login |
| `refresh` | POST `auth/refresh` | yes | 30/min | Body `refreshToken` |
| `googleOneTap` | POST `auth/google/one-tap` | yes | 20/min | Body `credential` |
| `oauthExchange` | POST `auth/oauth/exchange` | yes | 25/min | Body `OAuthExchangeDto` |
| `googleAuth` | GET `auth/google` | yes | — | Starts OAuth flow |
| `googleAuthCallback` | GET `auth/google/callback` | yes | — | Redirects to frontend with `code` |
| `getProfile` | GET `auth/me` | no | — | `validateUser(userId)` |

---

## `AuthModule`
**File:** [`backend/src/auth/auth.module.ts`](../../../backend/src/auth/auth.module.ts):32-50  
**Purpose:** `getAuthProviders()` adds `GoogleStrategy` only if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` exist. Exports `AuthService`, `JwtModule`, `JwtAuthGuard`.
