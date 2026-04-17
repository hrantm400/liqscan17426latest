-- One-time cleanup after removing STRATEGY_1 from the product (run manually when ready).
-- Table name matches Prisma @@map on SuperEngulfingSignal.
DELETE FROM super_engulfing_signals WHERE strategy_type = 'STRATEGY_1';
