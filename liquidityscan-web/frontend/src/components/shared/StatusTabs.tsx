import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { fetchSignalStats, SignalStats } from '../../services/signalsApi';
import { StrategyType } from '../../types';
import { TabView } from '../../hooks/useLifecycleFilter';

interface StatusTabsProps {
    strategyType: StrategyType;
    activeStatus: TabView | 'ALL';
    onStatusChange: (status: TabView | 'ALL') => void;
    hideArchive?: boolean; // SE Scanner v2: Hide archive tab for SE signals
    counts?: {
        total: number;
        live: number;
        closed: number;
        archive: number;
    } | null;
}

/**
 * Premium status tabs showing LIVE / CLOSED / ARCHIVE counts based on the new explicit lifecycle.
 * Fetches stats from backend lifecycle service.
 * 
 * SE SCANNER V2: Use hideArchive=true for SUPER_ENGULFING since SE has no archive state.
 */
export function StatusTabs({ strategyType, activeStatus, onStatusChange, hideArchive = false, counts = null }: StatusTabsProps) {
    const { data: stats } = useQuery<SignalStats>({
        queryKey: ['signal-stats', strategyType],
        queryFn: () => fetchSignalStats(strategyType),
        refetchInterval: 30000,
        staleTime: 15000,
        placeholderData: (prev) => prev,
        enabled: !counts,
    });

    const displayStats = counts ? {
        total: counts.total,
        live: counts.live,
        closedSignals: counts.closed,
        archived: counts.archive
    } : stats;

    const allTabs: Array<{ key: TabView | 'ALL', label: string, count: number | null, icon: string, color: string, bgActive: string, glow: string }> = [
        {
            key: 'ALL',
            label: 'All Signals',
            count: displayStats != null ? displayStats.total : null,
            icon: 'select_all',
            color: 'dark:text-white light:text-slate-900',
            bgActive: 'dark:bg-white/10 light:bg-green-100',
            glow: '',
        },
        {
            key: 'LIVE',
            label: 'Live Signals',
            count: displayStats != null ? displayStats.live : null,
            icon: 'radio_button_checked',
            color: 'dark:text-primary light:text-emerald-900',
            bgActive: 'dark:bg-primary/15 light:bg-green-100',
            glow: 'shadow-[0_0_15px_rgba(19,236,55,0.2)]',
        },
        {
            key: 'CLOSED',
            label: 'Recent Closed',
            count: displayStats != null ? displayStats.closedSignals : null,
            icon: 'inventory_2',
            color: 'dark:text-amber-400 light:text-amber-900',
            bgActive: 'dark:bg-amber-500/15 light:bg-amber-100',
            glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]',
        },
        {
            key: 'ARCHIVE',
            label: 'Archive',
            count: displayStats != null ? displayStats.archived : null,
            icon: 'folder_open',
            color: 'dark:text-gray-400 light:text-slate-500',
            bgActive: 'dark:bg-gray-500/15 light:bg-gray-100',
            glow: '',
        },
    ];
    
    // SE Scanner v2: Filter out archive tab if hideArchive is true
    const tabs = hideArchive ? allTabs.filter(t => t.key !== 'ARCHIVE') : allTabs;

    return (
        <div className="flex items-center gap-1.5 p-1 rounded-xl dark:bg-white/[0.03] light:bg-green-50/50 dark:border-white/5 light:border-green-200 border">
            {tabs.map((tab) => {
                const isActive = activeStatus === tab.key;
                return (
                    <motion.button
                        key={tab.key}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onStatusChange(tab.key)}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${isActive
                            ? `${tab.bgActive} ${tab.color} ${tab.glow} border dark:border-white/10 light:border-green-300`
                            : 'dark:text-gray-500 light:text-slate-500 hover:dark:text-gray-300 hover:light:text-slate-700 dark:hover:bg-white/5 light:hover:bg-slate-50'
                            }`}
                    >
                        <span className={`material-symbols-outlined text-sm ${isActive ? tab.color : ''}`}>
                            {tab.icon}
                        </span>
                        <span>{tab.label}</span>
                        <span
                            className={`min-w-[20px] h-5 flex items-center justify-center px-1.5 rounded-full text-[10px] font-black ${isActive
                                ? `${tab.color} dark:bg-black/20 light:bg-white`
                                : 'dark:text-gray-600 light:text-gray-400 dark:bg-white/5 light:bg-gray-100'
                                }`}
                        >
                            {tab.count === null ? '—' : tab.count}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}

