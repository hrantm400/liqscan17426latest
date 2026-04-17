# Prisma module

## `PrismaService`
**File:** [`backend/src/prisma/prisma.service.ts`](../../../backend/src/prisma/prisma.service.ts):5-13  
**Kind:** class extending `PrismaClient`  

**Purpose:** Single shared Prisma client with Nest lifecycle hooks.

### `onModuleInit`
**Signature:** `async onModuleInit(): Promise<void>`  
**Side effects:** `await this.$connect()`.

### `onModuleDestroy`
**Signature:** `async onModuleDestroy(): Promise<void>`  
**Side effects:** `await this.$disconnect()`.

**Notes:** Imported by all modules that need DB access via `PrismaModule` (`@Global()` — available everywhere without re-import).

## `PrismaModule`
**File:** [`backend/src/prisma/prisma.module.ts`](../../../backend/src/prisma/prisma.module.ts):4-9  
**Purpose:** `@Global()` module: provides and exports `PrismaService` once for the whole app.
