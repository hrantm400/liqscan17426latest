// All available features for granular access control
export const ALL_FEATURES = [
    'super_engulfing',
    'ict_bias',
    'rsi_divergence',
    'crt',
    '3_ob',
    'telegram_alerts',
    'academy',
    'tools',
    'watchlist',
] as const;

export type FeatureKey = typeof ALL_FEATURES[number] | 'all';
