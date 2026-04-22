-- Phase 7.3 — Sub-hour scanning runtime flag.
--
-- Adds a dedicated `coreLayerSubHourEnabled` column on the AppConfig
-- singleton so the admin UI can flip event-driven 15m/5m scanning
-- independently of the master Core-Layer flag.
--
-- NULL semantics mirror `coreLayerEnabled`:
--   - NULL on first boot after migration.
--   - Seeded from the CORE_LAYER_SUBHOUR_ENABLED env var by
--     CoreLayerRuntimeFlagService.onModuleInit, then AppConfig becomes
--     the source of truth.
--
-- No backfill here — the env seed on the next boot populates the row.

ALTER TABLE "app_config"
    ADD COLUMN "coreLayerSubHourEnabled" BOOLEAN;
