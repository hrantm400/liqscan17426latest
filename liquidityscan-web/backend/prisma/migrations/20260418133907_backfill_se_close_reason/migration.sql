-- Backfill se_close_reason from result_type for SUPER_ENGULFING COMPLETED rows.
-- Idempotent: only touches rows where se_close_reason IS NULL but result_type IS NOT NULL.
-- After PR 2.3 merge, SignalStatusBadge reads se_close_reason for SE close-reason labels,
-- so every SE COMPLETED row must have se_close_reason set before the schema drop.

UPDATE super_engulfing_signals
SET se_close_reason = CASE result_type
    WHEN 'tp3_full'      THEN 'TP3'
    WHEN 'tp2'           THEN 'TP2'
    WHEN 'tp1'           THEN 'TP1'
    WHEN 'sl'            THEN 'SL'
    WHEN 'candle_expiry' THEN 'EXPIRED'
    ELSE se_close_reason
END
WHERE "strategyType" = 'SUPER_ENGULFING'
  AND se_close_reason IS NULL
  AND result_type IS NOT NULL;

-- Hard assertion: fail the migration transaction if any SE COMPLETED row still has NULL se_close_reason.
-- This prevents schema-drop from shipping with broken UI reason labels.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM super_engulfing_signals
      WHERE "strategyType"='SUPER_ENGULFING'
        AND "lifecycleStatus"='COMPLETED'
        AND se_close_reason IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: SE COMPLETED rows with NULL se_close_reason still exist. Deploy aborted.';
  END IF;
END $$;
