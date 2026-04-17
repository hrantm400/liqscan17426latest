import { useState, useEffect } from 'react';
import { userApi } from '../services/userApi';

const FREE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XAUUSDT', 'XAGUSDT'];

export interface TierGating {
    /** Billing: paid subscription tier in DB (not affected by launch promo). */
    isPaid: boolean;
    /** Product access: paid OR free during global launch promo. */
    hasFullProductAccess: boolean;
    tier: string;
    loading: boolean;
    features: string[];
    /** Check if a symbol is available for the current tier, optionally checking a specific granted feature */
    isSymbolAllowed: (symbol: string, featureKey?: string) => boolean;
    /** Check if user has access to a specific feature */
    hasFeature: (feature: string) => boolean;
}

/**
 * Hook that provides tier-based gating for monitor pages.
 * Free users can only fully see BTC, ETH, XAU, XAG unless they have grants or launch promo is active.
 */
export function useTierGating(): TierGating {
    const [tier, setTier] = useState<string>('FREE');
    const [isPaid, setIsPaid] = useState(false);
    const [hasFullProductAccess, setHasFullProductAccess] = useState(false);
    const [features, setFeatures] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        userApi
            .getTier()
            .then((data: any) => {
                setTier(data.tier || 'FREE');
                setIsPaid(Boolean(data.isPaid));
                const launch = Boolean(data.launchPromoActive);
                const full =
                    typeof data.hasFullProductAccess === 'boolean'
                        ? data.hasFullProductAccess
                        : Boolean(data.isPaid) || (data.tier === 'FREE' && launch);
                setHasFullProductAccess(full);
                setFeatures(data.features || []);
            })
            .catch(() => {
                setTier('FREE');
                setIsPaid(false);
                setHasFullProductAccess(false);
                setFeatures([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const isSymbolAllowed = (symbol: string, featureKey?: string): boolean => {
        if (hasFullProductAccess) return true;
        if (featureKey && hasFeature(featureKey)) return true;
        return FREE_SYMBOLS.some(
            (fs) =>
                symbol.toUpperCase() === fs ||
                symbol.toUpperCase().startsWith(fs.replace('USDT', '')),
        );
    };

    const hasFeature = (feature: string): boolean => {
        if (hasFullProductAccess) return true;
        if (features.includes('all')) return true;
        return features.includes(feature);
    };

    return { isPaid, hasFullProductAccess, tier, loading, features, isSymbolAllowed, hasFeature };
}
