# Page: Top market coins

**File:** [`frontend/src/pages/TopMarketCoins.tsx`](../../../../frontend/src/pages/TopMarketCoins.tsx)  
**Route:** `/top-coins`

**Purpose:** Display top cryptocurrencies by market cap rank; backend proxy `GET /api/cmc/ranks` (cached CMC data) for rank mapping; used to align Binance symbols with market cap ordering.

**Related:** [`AppController.getCmcRanks`](../../backend/overview.md), [`useMarketCapData`](../hooks.md).
