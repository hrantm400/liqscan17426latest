-- Promote users.tier from String to UserTier enum.
-- DB pre-flight confirmed all current values are members of the enum:
--   FREE (10), PAID_MONTHLY (3). No PAID_ANNUAL, no FULL_ACCESS in data yet.
-- ALTER COLUMN TYPE requires dropping the textual default first and re-adding
-- it as the enum literal afterwards.

CREATE TYPE "UserTier" AS ENUM ('FREE', 'PAID_MONTHLY', 'PAID_ANNUAL', 'FULL_ACCESS');

ALTER TABLE "users" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "tier" TYPE "UserTier" USING "tier"::"UserTier";
ALTER TABLE "users" ALTER COLUMN "tier" SET DEFAULT 'FREE';
