/**
 * Single source of truth for Telegram alert subscriptions: scanner keys, labels, and
 * timeframes that match market scans (see ScannerService.scanSymbol).
 */

export type StrategyAlertDef = {
    value: string;
    label: string;
    icon: string;
    color: string;
    desc: string;
    /** Binance-style intervals emitted by scanners for this strategy */
    allowedTimeframes: string[];
};

const CANON_TF: Record<string, string> = {
    '1w': '1w',
    '1W': '1w',
    '1d': '1d',
    '1D': '1d',
    D: '1d',
    '4h': '4h',
    '4H': '4h',
    '1h': '1h',
    '1H': '1h',
    '60m': '1h',
    '15m': '15m',
    '15M': '15m',
    '5m': '5m',
    '5M': '5m',
};

/** Normalize user/signal timeframe to Binance interval string used in DB and filters. */
export function normalizeTimeframeForAlerts(tf: string): string {
    const k = String(tf ?? '').trim();
    if (!k) return k;
    if (CANON_TF[k] !== undefined) return CANON_TF[k];
    const lower = k.toLowerCase();
    if (CANON_TF[lower] !== undefined) return CANON_TF[lower];
    return lower;
}

export const STRATEGY_ALERT_DEFINITIONS: StrategyAlertDef[] = [
    {
        value: 'SUPER_ENGULFING',
        label: 'Super Engulfing',
        icon: '🔥',
        color: '#f59e0b',
        desc: 'Large candle patterns — scanned on 4h, 1d, 1w',
        allowedTimeframes: ['4h', '1d', '1w'],
    },
    {
        value: 'RSIDIVERGENCE',
        label: 'RSI Divergence',
        icon: '📊',
        color: '#8b5cf6',
        desc: 'RSI divergence — scanned on 1h, 4h, 1d',
        allowedTimeframes: ['1h', '4h', '1d'],
    },
    {
        value: 'ICT_BIAS',
        label: 'ICT Bias',
        icon: '🧭',
        color: '#06b6d4',
        desc: 'ICT bias — scanned on 4h, 1d, 1w',
        allowedTimeframes: ['4h', '1d', '1w'],
    },
    {
        value: 'CRT',
        label: 'CRT',
        icon: '🎯',
        color: '#ec4899',
        desc: 'CRT sweep — scanned on 1h, 4h, 1d, 1w',
        allowedTimeframes: ['1h', '4h', '1d', '1w'],
    },
    {
        value: '3OB',
        label: '3OB',
        icon: '📐',
        color: '#a78bfa',
        desc: 'Three OB — scanned on 4h, 1d, 1w',
        allowedTimeframes: ['4h', '1d', '1w'],
    },
    {
        value: 'CISD',
        label: 'CISD',
        icon: '⚡',
        color: '#22d3ee',
        desc: 'CISD / MSS — scanned on 4h, 1d, 1w',
        allowedTimeframes: ['4h', '1d', '1w'],
    },
];

export function getStrategyDefinition(value: string): StrategyAlertDef | undefined {
    const key = String(value ?? '').trim().toUpperCase();
    return STRATEGY_ALERT_DEFINITIONS.find((d) => d.value === key);
}

/** Intersect user-selected TFs with strategy allow-list; null/empty input => all TFs allowed (no JSON filter). */
export function normalizeSubscriptionTimeframes(
    strategyType: string,
    timeframes: string[] | undefined | null,
): string[] | null {
    const def = getStrategyDefinition(strategyType);
    if (!def) {
        if (!timeframes?.length) return null;
        return timeframes.map(normalizeTimeframeForAlerts);
    }
    const allowed = new Set(def.allowedTimeframes.map(normalizeTimeframeForAlerts));
    if (!timeframes?.length) return null;
    const out = timeframes.map(normalizeTimeframeForAlerts).filter((tf) => allowed.has(tf));
    return out.length ? out : null;
}

export function getStrategyAlertOptionsForApi() {
    return STRATEGY_ALERT_DEFINITIONS.map(({ value, label, icon, color, desc, allowedTimeframes }) => ({
        value,
        label,
        icon,
        color,
        desc,
        allowedTimeframes: [...allowedTimeframes],
    }));
}

