-- Replace the full-tuple unique constraint on core_layer_signals with a partial
-- unique index that only fires on ACTIVE rows.
--
-- Rationale: a chain can (and normally does) cycle through ACTIVE → CLOSED → ACTIVE
-- when an alignment re-forms after the previous one expired. The original constraint
-- (`pair, variant, direction, anchor, status`) prevented duplicate ACTIVE rows but
-- also prevented more than one CLOSED row per (pair, variant, direction, anchor),
-- which is exactly what the orphan-close and anchor-less paths produce on a second
-- closure cycle. That crash was latent until the §4 temporal-coherence gate started
-- closing stale chains more aggressively.
--
-- New shape:
--   * One ACTIVE row per (pair, variant, direction, anchor) — partial unique index.
--   * Unlimited CLOSED rows per that tuple — free-form history.
--
-- Downgrade path: re-create the old full-tuple unique; there is no data loss so
-- this is reversible as long as no duplicate CLOSED rows exist in the meantime.

DROP INDEX IF EXISTS "core_layer_signals_pair_variant_direction_anchor_status_key";

CREATE UNIQUE INDEX "core_layer_signals_active_unique"
  ON "core_layer_signals" ("pair", "variant", "direction", "anchor")
  WHERE "status" = 'ACTIVE';
