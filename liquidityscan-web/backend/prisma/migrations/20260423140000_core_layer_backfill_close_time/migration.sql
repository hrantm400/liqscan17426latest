-- Core-Layer field-semantics backfill.
--
-- Before this migration: `core_layer_signals.tfLastCandleClose[tf]` held the
--   signal candle's OPEN time (`detectedAt.getTime()`), because upstream
--   SE/CRT/ICT-BIAS scanners write `detectedAt = candle.openTime` and the
--   detection service piped that value through unchanged.
-- After this migration:  each value equals the signal candle's CLOSE time
--   (openTime + TF candle interval), matching the field name and what the
--   frontend's `targetOpen = signalCloseMs - intervalMs` arrow-placement
--   math has always assumed.
--
-- Paired with the code change in CoreLayerDetectionService.collapseToChains
-- (commit 2941c59) that adds `TF_CANDLE_MS[tf]` at the write site going
-- forward. Standard Prisma deploy order — `prisma migrate deploy` runs this
-- before the app starts, so there is no window in which the old code
-- writes an open-time value that this migration would double-shift.
--
-- Applies to BOTH ACTIVE and CLOSED rows (consistency — the JSON field is
-- displayed on history rows too).
--
-- NOT IDEMPOTENT. Every run shifts values forward by one TF interval. If
-- this migration were re-run manually (outside `prisma migrate deploy`)
-- every timestamp would drift. Do not retrigger. Rollback is a symmetric
-- reverse statement included as a comment at the bottom.

UPDATE core_layer_signals
SET "tfLastCandleClose" = (
  SELECT jsonb_object_agg(
    key,
    CASE key
      WHEN 'W'   THEN to_jsonb(value::text::bigint + 604800000)  -- 7d
      WHEN '1D'  THEN to_jsonb(value::text::bigint + 86400000)   -- 24h
      WHEN '4H'  THEN to_jsonb(value::text::bigint + 14400000)   -- 4h
      WHEN '1H'  THEN to_jsonb(value::text::bigint + 3600000)    -- 1h
      WHEN '15m' THEN to_jsonb(value::text::bigint + 900000)     -- 15m
      WHEN '5m'  THEN to_jsonb(value::text::bigint + 300000)     -- 5m
      ELSE value
    END
  )
  FROM jsonb_each("tfLastCandleClose")
)
WHERE "tfLastCandleClose" IS NOT NULL
  AND "tfLastCandleClose" <> '{}'::jsonb;

-- Rollback (run manually if the code change is reverted before the next
-- deploy). Mirrors the shift above with subtraction instead of addition:
--
-- UPDATE core_layer_signals
-- SET "tfLastCandleClose" = (
--   SELECT jsonb_object_agg(
--     key,
--     CASE key
--       WHEN 'W'   THEN to_jsonb(value::text::bigint - 604800000)
--       WHEN '1D'  THEN to_jsonb(value::text::bigint - 86400000)
--       WHEN '4H'  THEN to_jsonb(value::text::bigint - 14400000)
--       WHEN '1H'  THEN to_jsonb(value::text::bigint - 3600000)
--       WHEN '15m' THEN to_jsonb(value::text::bigint - 900000)
--       WHEN '5m'  THEN to_jsonb(value::text::bigint - 300000)
--       ELSE value
--     END
--   )
--   FROM jsonb_each("tfLastCandleClose")
-- )
-- WHERE "tfLastCandleClose" IS NOT NULL
--   AND "tfLastCandleClose" <> '{}'::jsonb;
