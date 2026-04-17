# Page: Super Engulfing interactive module

**Route:** `/superengulfing` (note: `App.tsx` may render without `AnimatedPage` wrapper — see source)

**Files:**
- [`frontend/src/pages/SuperEngulfing.tsx`](../../../../frontend/src/pages/SuperEngulfing.tsx) — page shell
- [`frontend/src/superengulfing/`](../../../../frontend/src/superengulfing/) — sub-app:
  - [`components/CandleVisualizer.tsx`](../../../../frontend/src/superengulfing/components/CandleVisualizer.tsx)
  - [`components/QuizInterface.tsx`](../../../../frontend/src/superengulfing/components/QuizInterface.tsx)
  - [`components/StrategyBuilder.tsx`](../../../../frontend/src/superengulfing/components/StrategyBuilder.tsx)
  - [`services/logic.ts`](../../../../frontend/src/superengulfing/services/logic.ts) — pattern rules
  - [`services/scenarios.ts`](../../../../frontend/src/superengulfing/services/scenarios.ts) — practice scenarios
  - [`services/audio.ts`](../../../../frontend/src/superengulfing/services/audio.ts) — feedback sounds

**Purpose:** Educational game/quiz for learning Super Engulfing patterns separate from live `MonitorSuperEngulfing` data.
