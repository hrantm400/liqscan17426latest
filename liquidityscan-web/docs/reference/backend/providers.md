# Market data providers

## `IExchangeProvider` / `IKline`
**File:** [`backend/src/providers/data-provider.interface.ts`](../../../backend/src/providers/data-provider.interface.ts)  
**Purpose:** Abstract klines, symbols, current prices, 24h volumes.

## `BinanceProvider`
**File:** [`backend/src/providers/binance.provider.ts`](../../../backend/src/providers/binance.provider.ts)  
**Purpose:** Default implementation: Binance REST `/api/v3/klines`, exchange info, ticker prices.

## `CoinRayProvider`
**File:** [`backend/src/providers/coinray.provider.ts`](../../../backend/src/providers/coinray.provider.ts)  
**Purpose:** Alternate provider (if wired) — check for env keys and usage in `CandlesService.getProvider` if extended.

**Note:** Current `CandlesService.getProvider()` returns `BinanceProvider` only.
