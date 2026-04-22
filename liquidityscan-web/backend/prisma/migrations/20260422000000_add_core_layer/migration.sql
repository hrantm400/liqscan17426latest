-- Phase 4 — Core-Layer backend. Adds the DB surface for the alignment-detection
-- layer that sits on top of SE/CRT/BIAS scanners. Runtime detection is gated
-- by CORE_LAYER_ENABLED (default false) — applying this migration with the
-- flag off is a no-op at the service layer.
--
-- See backend/docs/CORE_LAYER_ADR.md for the locked decisions (D10 signal
-- identity, D13 life-state derivation, D14 DB as source of truth).

-- CreateEnum
CREATE TYPE "core_layer_variant" AS ENUM ('SE', 'CRT', 'BIAS');

-- CreateEnum
CREATE TYPE "core_layer_direction" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "core_layer_anchor" AS ENUM ('WEEKLY', 'DAILY', 'FOURHOUR');

-- CreateEnum
CREATE TYPE "core_layer_status" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "core_layer_signals" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "variant" "core_layer_variant" NOT NULL,
    "direction" "core_layer_direction" NOT NULL,
    "anchor" "core_layer_anchor" NOT NULL,
    "chain" TEXT[],
    "depth" INTEGER NOT NULL,
    "correlationPairs" JSONB NOT NULL,
    "tfLifeState" JSONB NOT NULL,
    "tfLastCandleClose" JSONB NOT NULL,
    "sePerTf" JSONB,
    "plusSummary" TEXT,
    "status" "core_layer_status" NOT NULL DEFAULT 'ACTIVE',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPromotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_layer_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_layer_history_entries" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "event" TEXT NOT NULL,
    "fromDepth" INTEGER,
    "toDepth" INTEGER,
    "fromAnchor" TEXT,
    "toAnchor" TEXT,
    "tfAdded" TEXT,
    "tfRemoved" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_layer_history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "core_layer_signals_variant_status_idx" ON "core_layer_signals"("variant", "status");

-- CreateIndex
CREATE INDEX "core_layer_signals_pair_idx" ON "core_layer_signals"("pair");

-- CreateIndex
CREATE INDEX "core_layer_signals_lastPromotedAt_idx" ON "core_layer_signals"("lastPromotedAt");

-- CreateIndex
CREATE UNIQUE INDEX "core_layer_signals_pair_variant_direction_anchor_status_key" ON "core_layer_signals"("pair", "variant", "direction", "anchor", "status");

-- CreateIndex
CREATE INDEX "core_layer_history_entries_signalId_at_idx" ON "core_layer_history_entries"("signalId", "at");

-- AddForeignKey
ALTER TABLE "core_layer_history_entries" ADD CONSTRAINT "core_layer_history_entries_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "core_layer_signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
