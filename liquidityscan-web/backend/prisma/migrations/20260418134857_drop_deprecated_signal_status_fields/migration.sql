-- Drop deprecated status/result columns from super_engulfing_signals.
-- Canonical truth is now lifecycleStatus (SignalStatus enum, not null) and result (SignalResult enum, nullable).
-- SE granular close reasons are preserved in se_close_reason (backfilled in previous migration).

DROP INDEX IF EXISTS "super_engulfing_signals_status_idx";

ALTER TABLE "super_engulfing_signals" DROP COLUMN "status";
ALTER TABLE "super_engulfing_signals" DROP COLUMN "state";
ALTER TABLE "super_engulfing_signals" DROP COLUMN "result_v2";
ALTER TABLE "super_engulfing_signals" DROP COLUMN "result_type";
ALTER TABLE "super_engulfing_signals" DROP COLUMN "outcome";
