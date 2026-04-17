// User types
export interface User {
  id: string;
  email: string;
  name?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionExpiresAt?: string;
  tier?: string;            // FREE, PAID_MONTHLY, PAID_ANNUAL
  referrerId?: string;
  affiliateCode?: string;
  isAdmin?: boolean;
  timezone?: string;
  createdAt: string;
  updatedAt: string;
}

// Signal types
export type StrategyType =
  | 'RSIDIVERGENCE'
  | 'SUPER_ENGULFING'
  | 'ICT_BIAS'
  | 'CRT'
  | '3OB'
  | 'CISD';
export type SignalType = 'BUY' | 'SELL';
export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
export type SignalStatus = 'ACTIVE' | 'HIT_TP' | 'HIT_SL' | 'EXPIRED';

export type SignalLifecycleStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'ARCHIVED';
export type SignalResult = 'WIN' | 'LOSS' | null;

// SE Scanner v3 types (3 TP levels)
export type SeState = 'live' | 'closed';
export type SeResult = 'won' | 'lost';
export type SeResultType = 'tp1' | 'tp2' | 'tp3_full' | 'sl' | 'candle_expiry';
export type SePatternV2 =
  | 'REV_BULLISH'
  | 'REV_BEARISH'
  | 'REV_PLUS_BULLISH'
  | 'REV_PLUS_BEARISH'
  | 'RUN_BULLISH'
  | 'RUN_BEARISH'
  | 'RUN_PLUS_BULLISH'
  | 'RUN_PLUS_BEARISH';
export type SeDirectionV2 = 'bullish' | 'bearish';

export interface Signal {
  id: string;
  strategyType: StrategyType;
  symbol: string;
  timeframe: Timeframe;
  signalType: SignalType;
  price: number;
  detectedAt: string;
  lifecycleStatus: SignalLifecycleStatus;
  result?: SignalResult;
  status: string; // deprecated
  metadata?: {
    [key: string]: unknown; // Allow arbitrary legacy metadata properties
    sePattern?: string;
    seDirection?: 'RUN' | 'REV';
    seTime?: string;
    rsiCondition?: string;
    triggerType?: string;
    triggerPrice?: number;
    // strategy 1 specific
    setupPrice?: number;
    stopLoss?: number;
    tp1?: number;
    tp2?: number;
  };
  closedAt?: string;
  closedPrice?: number;
  pnlPercent?: number;
  outcome?: string; // deprecated
  // SE Advanced Lifecycle (legacy)
  direction?: string;
  se_entry_zone?: number;
  se_sl?: number;
  se_tp1?: number;
  se_tp2?: number;
  se_current_sl?: number;
  se_r_ratio_hit?: boolean;
  se_close_price?: number;
  se_close_reason?: string;
  candles_tracked?: number;
  max_candles?: number;
  entryConfirmedAt?: string;
  // ICT Bias Lifecycle
  bias_direction?: string;
  bias_level?: number;
  bias_result?: string;
  bias_validated_at?: string;
  // ============================================
  // SE Scanner v3 fields (3 TP levels)
  // ============================================
  state?: SeState;
  type_v2?: string;
  pattern_v2?: SePatternV2;
  direction_v2?: SeDirectionV2;
  entry_price?: number;
  sl_price?: number;
  current_sl_price?: number;
  tp1_price?: number;
  tp2_price?: number;
  tp3_price?: number;
  tp1_hit?: boolean;
  tp2_hit?: boolean;
  tp3_hit?: boolean;
  result_v2?: SeResult;
  result_type?: SeResultType;
  close_price?: number;
  candle_count?: number;
  triggered_at?: string;
  closed_at_v2?: string;
  delete_at?: string;
}

// Candle types
export interface Candle {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  openTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
}

// Strategy types
export interface Strategy {
  id: string;
  userId: string;
  name: string;
  strategyType: StrategyType;
  parameters: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Subscription types
export interface Subscription {
  id: string;
  name: string;
  price: number;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
  billingPeriod?: 'monthly' | 'yearly' | 'lifetime';
  isActive?: boolean;
  sortOrder?: number;
  cryptoCurrencies?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  subscriptionId: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending_payment';
  startedAt?: string;
  expiresAt?: string;
  renewalDate?: string;
  autoRenew: boolean;
  paymentId?: string;
  subscription?: Subscription;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPayment {
  id: string;
  userId: string;
  subscriptionId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  payAddress?: string;
  paymentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// RSI Divergence types
export interface RSIDivergence {
  type: 'BULLISH' | 'BEARISH';
  priceLow: number;
  priceHigh: number;
  rsiLow: number;
  rsiHigh: number;
  timestamp: number;
  pivotIndex: number;
}

// Super Engulfing types
export interface SuperEngulfing {
  type: 'BULLISH' | 'BEARISH';
  previousCandle: Candle;
  currentCandle: Candle;
  hasWickFilter?: boolean;
  is3X?: boolean;
}

// ICT Bias types
export type BiasType = 'BULLISH' | 'BEARISH' | 'RANGING' | 'UNKNOWN';

export interface ICTBias {
  bias: BiasType;
  message: string;
  high: number;
  low: number;
  isValid: boolean;
}
