# Realtime (WebSocket) module

## `RealtimeGateway`
**File:** [`backend/src/realtime/realtime.gateway.ts`](../../../backend/src/realtime/realtime.gateway.ts):36-166  

**Purpose:** Socket.IO gateway at path `/socket.io`; JWT auth on connection; room per `symbol::timeframe`; poll every **3s** and emit `candle:update` to subscribers.

### `handleConnection`
**Purpose:** Read `auth.token` or query `token`; `jwtService.verify`; attach `userId` to `socket.data`; disconnect if invalid.

### `onSubscribe` / `onUnsubscribe`
**Events:** `subscribe:symbol` / `unsubscribe:symbol` with `{ symbol, timeframe }`  
**Purpose:** Join/leave room; maintain `roomSubscribers` refcount map.

### `pollOnce` (private)
**Purpose:** For each active room, `candlesService.getKlines(symbol, timeframe, 2)`; emit last candle to room.

### `onModuleDestroy`
**Purpose:** Clear polling interval.

**CORS:** Matches `FRONTEND_URL` comma list (same as HTTP).
