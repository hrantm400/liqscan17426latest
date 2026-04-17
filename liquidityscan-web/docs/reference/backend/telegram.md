# Telegram module

## `TelegramService`
**File:** [`backend/src/telegram/telegram.service.ts`](../../../backend/src/telegram/telegram.service.ts):19+  

**Purpose:** `node-telegram-bot-api` with **polling** when `TELEGRAM_BOT_TOKEN` set; handles `/start` with `link_CODE` deep link via `AlertsService.linkTelegramChatFromCode`; sends signal notifications with optional image generation (Satori + Resvg); filters alerts by user subscriptions and pricing.

**Key areas in file (read source for full list):**
- Bot init, font load for Satori
- Message handlers for linking and errors
- Methods to send formatted alerts, direct messages (`sendDirectMessage` used by admin broadcast)
- Integration with `PricingService` / `AlertsService` for eligibility

## `TelegramChartPlaywrightService`
**File:** [`backend/src/telegram/telegram-chart-playwright.service.ts`](../../../backend/src/telegram/telegram-chart-playwright.service.ts)  
**Purpose:** Headless browser screenshots of charts for rich Telegram cards (Playwright).

## `TelegramModule`
**File:** [`backend/src/telegram/telegram.module.ts`](../../../backend/src/telegram/telegram.module.ts)  
**Purpose:** Wires services for injection into `SignalsService`, `AlertsService`, `AdminService`.
