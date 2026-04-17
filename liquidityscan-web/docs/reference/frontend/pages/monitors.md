# Pages: Strategy monitors

All routes use `AnimatedPage` + tier gates where applicable.

| Page file | Route | Purpose |
|-----------|-------|---------|
| [`MonitorSuperEngulfing.tsx`](../../../../frontend/src/pages/MonitorSuperEngulfing.tsx) | `/monitor/superengulfing` | List/filter Super Engulfing signals |
| [`MonitorBias.tsx`](../../../../frontend/src/pages/MonitorBias.tsx) | `/monitor/bias` | ICT Bias monitor |
| [`MonitorRSI.tsx`](../../../../frontend/src/pages/MonitorRSI.tsx) | `/monitor/rsi` | RSI divergence monitor; uses `fetchRsiDivergenceSignalsUnion` |
| [`MonitorCRT.tsx`](../../../../frontend/src/pages/MonitorCRT.tsx) | `/monitor/crt` | CRT signals |
| [`Monitor3OB.tsx`](../../../../frontend/src/pages/Monitor3OB.tsx) | `/monitor/3ob` | 3OB signals |
| [`MonitorCISD.tsx`](../../../../frontend/src/pages/MonitorCISD.tsx) | `/monitor/cisd` | CISD — often pairs with CISD chart overlays |

**Shared patterns:** `fetchSignals` / union fetchers, volume filters, `InteractiveLiveChart` or table rows linking to `/signals/:id`, `ProOverlay` for FREE tier, `useSignalNotifications` optional.
