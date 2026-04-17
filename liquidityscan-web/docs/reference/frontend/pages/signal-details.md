# Page: Signal details

**File:** [`frontend/src/pages/SignalDetails.tsx`](../../../../frontend/src/pages/SignalDetails.tsx)  
**Route:** `/signals/:id`

**Purpose:** Full signal breakdown: symbol, timeframe, strategy metadata, lifecycle status, PnL if closed, embedded chart (`InteractiveLiveChart` / `Chart`), links to external TradingView.

**Data:** `fetchSignalById(id)` from [`signalsApi`](../services.md); WebSocket subscription for live candle optional.

**Related:** [`floatingChartRoutes`](../utils.md), [`SignalBadge`](../components.md).
