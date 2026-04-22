-- Phase 5b — Core-Layer admin controls.
--
-- Adds `coreLayerEnabled` to the AppConfig singleton so the admin panel
-- can flip Core-Layer on/off at runtime without editing `.env` and
-- restarting the process. Matches the ADR D17.1 override ordering:
--
--   1. At boot, CoreLayerRuntimeFlagService seeds AppConfig from
--      CORE_LAYER_ENABLED env var if the column is currently NULL
--      (i.e. first boot after migration).
--   2. Every subsequent read consults AppConfig. Admin writes via
--      POST /api/admin/core-layer/enabled update this column.
--   3. Env var becomes a seed value only; AppConfig is the runtime
--      source of truth.
--
-- Nullable on purpose: NULL means "never touched, fall back to env".
-- After first boot the service will populate it and it stays non-null
-- from then on.

ALTER TABLE "app_config" ADD COLUMN "coreLayerEnabled" BOOLEAN;
