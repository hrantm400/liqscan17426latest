-- Phase 2 / PR 2.1: unify the RSI divergence strategy name to a single canonical
-- value ('RSIDIVERGENCE'). Safe to re-run; both UPDATE statements affect 0 rows
-- when the DB is already clean. Defensive guard in case a legacy row slips in.

UPDATE "super_engulfing_signals"
  SET "strategyType" = 'RSIDIVERGENCE'
  WHERE "strategyType" = 'RSI_DIVERGENCE';

UPDATE "super_engulfing_signals"
  SET "id" = REPLACE("id", 'RSI_DIVERGENCE-', 'RSIDIVERGENCE-')
  WHERE "id" LIKE 'RSI_DIVERGENCE-%';
