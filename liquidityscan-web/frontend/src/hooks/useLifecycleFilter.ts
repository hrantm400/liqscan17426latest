import { useMemo } from 'react';
import { Signal } from '../types';

export type TabView = 'LIVE' | 'CLOSED' | 'ARCHIVE' | 'ALL';

interface FilterParams {
    signals: Signal[];
    tab: TabView;
}

/**
 * Filter signals by lifecycle tab.
 * Uses canonical lifecycleStatus only. SE-specific ARCHIVE is a no-op (SE never archives).
 */
export function useLifecycleFilter({ signals, tab }: FilterParams) {
    return useMemo(() => {
        return signals.filter((signal) => {
            const isSuperEngulfing = signal.strategyType === 'SUPER_ENGULFING';

            switch (tab) {
                case 'LIVE':
                    return signal.lifecycleStatus === 'PENDING' || signal.lifecycleStatus === 'ACTIVE';

                case 'CLOSED':
                    return signal.lifecycleStatus === 'COMPLETED' || signal.lifecycleStatus === 'EXPIRED';

                case 'ARCHIVE':
                    if (isSuperEngulfing) return false;
                    return signal.lifecycleStatus === 'ARCHIVED';

                case 'ALL':
                default:
                    return true;
            }
        });
    }, [signals, tab]);
}
