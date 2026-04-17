-- One-time cleanup (run manually after deploying TF-aware STUCK_EXPIRED for ICT_BIAS).
-- Removes weekly ICT Bias rows that were force-closed as STUCK_EXPIRED before the next
-- weekly candle could be validated. They are not genuine market FAIL/WIN outcomes.
--
-- Review counts before DELETE:
-- SELECT COUNT(*) FROM super_engulfing_signals
-- WHERE "strategyType" = 'ICT_BIAS'
--   AND LOWER("timeframe") = '1w'
--   AND "se_close_reason" = 'STUCK_EXPIRED';

DELETE FROM super_engulfing_signals
WHERE "strategyType" = 'ICT_BIAS'
  AND LOWER("timeframe") = '1w'
  AND "se_close_reason" = 'STUCK_EXPIRED';
