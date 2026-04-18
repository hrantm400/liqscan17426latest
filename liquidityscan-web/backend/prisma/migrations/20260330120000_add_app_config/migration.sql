-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "launchPromoFullAccess" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "app_config" ("id", "launchPromoFullAccess", "updatedAt")
VALUES ('singleton', false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
