import { useMemo } from 'react';
import { Signal } from '../types';

export type TabView = 'LIVE' | 'CLOSED' | 'ARCHIVE' | 'ALL';

interface FilterParams {
    signals: Signal[];
    tab: TabView;
}

/**
 * Filter signals by lifecycle tab.
 * 
 * SE SCANNER V2 SPEC:
 * - SE signals use the new `state` field: "live" or "closed"
 * - There is NO archive state for SE signals
 * - Other strategies continue to use legacy lifecycleStatus
 */
export function useLifecycleFilter({ signals, tab }: FilterParams) {
    return useMemo(() => {
        return signals.filter((signal) => {
            const isSuperEngulfing = signal.strategyType === 'SUPER_ENGULFING';
            
            switch (tab) {
                case 'LIVE':
                    // SE v2: use state field; legacy: use lifecycleStatus
                    if (isSuperEngulfing && signal.state) {
                        return signal.state === 'live';
                    }
                    return signal.lifecycleStatus === 'PENDING' || signal.lifecycleStatus === 'ACTIVE';

                case 'CLOSED':
                    // SE v2: use state field; legacy: use lifecycleStatus
                    if (isSuperEngulfing && signal.state) {
                        return signal.state === 'closed';
                    }
                    return signal.lifecycleStatus === 'COMPLETED' || signal.lifecycleStatus === 'EXPIRED';

                case 'ARCHIVE':
                    // SE v2: No archive - always return false for SE signals
                    if (isSuperEngulfing) {
                        return false;
                    }
                    return signal.lifecycleStatus === 'ARCHIVED';

                case 'ALL':
                default:
                    return true;
            }
        });
    }, [signals, tab]);
}
