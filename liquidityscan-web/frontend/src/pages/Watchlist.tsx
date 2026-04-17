import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { fetchSignals, fetchRsiDivergenceSignalsUnion } from '../services/signalsApi';
import { userApi } from '../services/userApi';
import { useWatchlistStore } from '../store/watchlistStore';
import { useAuthStore } from '../store/authStore';
import { staggerContainer, listItemVariants } from '../utils/animations';
import { SignalStatusBadge } from '../components/shared/SignalStatusBadge';
import { FavoriteStar } from '../components/shared/FavoriteStar';
import { TimeDisplay } from '../components/shared/TimeDisplay';
import { Signal } from '../types';

type AlertRow = { symbol?: string; isActive?: boolean };

function TelegramAlertsCoinIcon({ hasAlerts }: { hasAlerts: boolean }) {
    if (!hasAlerts) return null;
    return (
        <span
            className="inline-flex shrink-0 text-sky-400 light:text-sky-600 opacity-90"
            title="Telegram alerts enabled for this coin"
            aria-label="Telegram alerts enabled for this coin"
        >
            <Send className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
    );
}

export const Watchlist: React.FC = () => {
    const navigate = useNavigate();
    const { favorites } = useWatchlistStore();
    const { isAuthenticated } = useAuthStore();
    const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');

    const { data: alertsData } = useQuery({
        queryKey: ['user-alerts', 'watchlist-indicators'],
        queryFn: () => userApi.getAlerts(),
        enabled: isAuthenticated,
        staleTime: 60_000,
    });

    const symbolsWithTelegramAlerts = useMemo(() => {
        const set = new Set<string>();
        const rows = alertsData as AlertRow[] | undefined;
        if (!Array.isArray(rows)) return set;
        for (const a of rows) {
            if (a?.isActive && a.symbol) set.add(String(a.symbol).trim().toUpperCase());
        }
        return set;
    }, [alertsData]);

    // Fetch all for the active favorites
    const { data: seData, isLoading: seLoading } = useQuery({
        queryKey: ['signals', 'SUPER_ENGULFING', 1000, 0],
        queryFn: () => fetchSignals('SUPER_ENGULFING', 1000, 0),
        refetchInterval: 5 * 60 * 1000,
    });
    
    const { data: biasData, isLoading: biasLoading } = useQuery({
        queryKey: ['signals', 'ICT_BIAS', 1000, 0],
        queryFn: () => fetchSignals('ICT_BIAS', 1000, 0),
        refetchInterval: 5 * 60 * 1000,
    });

    const { data: rsiData, isLoading: rsiLoading } = useQuery({
        queryKey: ['signals', 'RSI_DIVERGENCE_UNION', 1000, 0],
        queryFn: () => fetchRsiDivergenceSignalsUnion(1000, 0),
        refetchInterval: 5 * 60 * 1000,
    });

    const { data: crtData, isLoading: crtLoading } = useQuery({
        queryKey: ['signals', 'CRT', 1000, 0],
        queryFn: () => fetchSignals('CRT', 1000, 0),
        refetchInterval: 5 * 60 * 1000,
    });

    const { data: threeObData, isLoading: threeObLoading } = useQuery({
        queryKey: ['signals', '3OB', 1000, 0],
        queryFn: () => fetchSignals('3OB', 1000, 0),
        refetchInterval: 5 * 60 * 1000,
    });

    const isLoading = seLoading || biasLoading || rsiLoading || crtLoading || threeObLoading;

    const filteredSignals = useMemo(() => {
        if (!favorites.length) return [];
        
        const all: Signal[] = [
            ...(Array.isArray(seData) ? seData : []),
            ...(Array.isArray(biasData) ? biasData : []),
            ...(Array.isArray(rsiData) ? rsiData : []),
            ...(Array.isArray(crtData) ? crtData : []),
            ...(Array.isArray(threeObData) ? threeObData : []),
        ];

        let result = all.filter(s => favorites.includes(s.symbol));

        // Filter by Status
        if (statusFilter === 'ACTIVE') {
            result = result.filter(s => s.status === 'ACTIVE');
        } else if (statusFilter === 'COMPLETED') {
            result = result.filter(s => ['WIN', 'LOSS', 'CANCELLED'].includes(s.status));
        }

        // Sort by time
        return result.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    }, [seData, biasData, rsiData, crtData, threeObData, favorites, statusFilter]);

    const formatPrice = (p: number) => p ? p.toFixed(p > 100 ? 2 : p > 1 ? 4 : 6) : '—';

    // Symbol Avatar Component snippet
    const SymbolAvatar = ({ symbol }: { symbol: string }) => {
        const firstLetter = symbol.charAt(0).toUpperCase();
        const colors = [
            'bg-amber-500/20 text-amber-500 ring-amber-500/40',
            'bg-emerald-500/20 text-emerald-500 ring-emerald-500/40',
            'bg-blue-500/20 text-blue-500 ring-blue-500/40',
            'bg-purple-500/20 text-purple-500 ring-purple-500/40',
            'bg-pink-500/20 text-pink-500 ring-pink-500/40',
        ];
        const colorIndex = symbol.charCodeAt(0) % colors.length;
        return (
            <div className={`w-8 h-8 rounded-full ${colors[colorIndex]} flex items-center justify-center text-xs font-bold ring-1 shrink-0`}>
                {firstLetter}
            </div>
        );
    };

    return (
        <motion.div
            className="flex flex-col h-full"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
        >
            <div className="flex flex-col gap-6 px-4 pt-4 pb-2 md:px-8 md:pt-6 shrink-0">
                <div className="flex items-center gap-2 text-xs font-medium dark:text-gray-500 light:text-slate-400 uppercase tracking-wider">
                    <span className="dark:text-white light:text-text-dark cursor-pointer transition-colors" onClick={() => navigate('/dashboard')}>Scanner</span>
                    <span className="material-symbols-outlined text-[10px]">chevron_right</span>
                    <span className="text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)] flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">star</span>
                        Watchlist
                    </span>
                </div>
                
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-xl md:text-3xl font-black tracking-tighter dark:text-white light:text-text-dark drop-shadow-lg flex items-center gap-3">
                            My Watchlist
                            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center text-amber-500 text-sm font-bold shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                                {favorites.length} Coins
                            </div>
                        </h1>
                        <p className="text-sm dark:text-gray-400 light:text-slate-500 mt-2 max-w-lg leading-relaxed">
                            Monitor signals strictly for your favorite symbols across all active scanning strategies to reduce market noise.
                        </p>
                    </div>

                    <div className="flex items-center p-1 rounded-xl border dark:bg-black/20 dark:border-white/5 light:bg-slate-100 light:border-slate-200">
                        <button 
                            onClick={() => setStatusFilter('ALL')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${statusFilter === 'ALL'
                                ? 'dark:bg-white/10 dark:text-white light:bg-white light:text-slate-900 shadow-md'
                                : 'dark:text-gray-500 dark:hover:text-white dark:hover:bg-white/5 light:text-slate-500 light:hover:text-slate-900 light:hover:bg-white/70'
                            }`}
                        >
                            History
                        </button>
                        <button 
                            onClick={() => setStatusFilter('ACTIVE')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all ${statusFilter === 'ACTIVE'
                                ? 'bg-amber-500/20 text-amber-500 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)] light:bg-amber-100 light:text-amber-800 light:border-amber-200'
                                : 'dark:text-gray-500 dark:hover:text-white dark:hover:bg-white/5 light:text-slate-500 light:hover:text-slate-900 light:hover:bg-white/70'
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'ACTIVE' ? 'bg-amber-500 animate-pulse' : 'bg-gray-500 light:bg-slate-400'}`}></span>
                            Active Now
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 md:px-8 md:pb-8">
                <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
                    
                    {favorites.length === 0 ? (
                        <motion.div variants={listItemVariants} className="flex flex-col items-center justify-center py-20 gap-4 glass-panel rounded-3xl mt-10">
                            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-2">
                                <span className="material-symbols-outlined text-amber-500 text-4xl">star</span>
                            </div>
                            <h3 className="text-xl font-bold dark:text-white light:text-text-dark">Your Watchlist is Empty</h3>
                            <p className="text-sm dark:text-gray-400 light:text-slate-500 text-center max-w-md leading-relaxed">
                                Click the star icon next to any symbol in the monitor tables to add it to your watchlist. This allows you to track specific coins across all scanner strategies without the noise.
                            </p>
                            <button onClick={() => navigate('/dashboard')} className="px-6 py-2.5 bg-white text-black font-bold rounded-xl mt-4 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all">
                                Explore Markets
                            </button>
                        </motion.div>
                    ) : isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                                <span className="text-xs dark:text-gray-500 light:text-slate-400 font-medium tracking-widest uppercase">Scanning Favorites...</span>
                            </div>
                        </div>
                    ) : filteredSignals.length === 0 ? (
                        <motion.div variants={listItemVariants} className="flex flex-col items-center justify-center py-20 gap-3 glass-panel rounded-3xl mt-10 border-dashed dark:border-white/10 light:border-slate-200 bg-transparent">
                            <span className="material-symbols-outlined text-gray-600 text-3xl mb-2">blur_on</span>
                            <span className="text-sm font-bold dark:text-gray-400 light:text-text-light-secondary">No matching signals found</span>
                            <span className="text-xs dark:text-gray-600 light:text-slate-500 text-center max-w-sm">
                                There are currently no {statusFilter.toLowerCase()} signals for your {favorites.length} watchlisted coins.
                            </span>
                        </motion.div>
                    ) : (
                        <>
                        <div className="hidden md:block glass-panel rounded-2xl overflow-hidden shadow-xl border dark:border-white/5 light:border-green-200">
                            <div className="grid grid-cols-[60px_auto_1fr_120px_100px_100px_120px_100px] gap-2 px-6 py-4 border-b dark:border-white/5 light:border-green-300 text-[10px] font-bold dark:text-gray-500 light:text-slate-500 uppercase tracking-widest dark:bg-black/20 light:bg-slate-50">
                                <span>Fav</span>
                                <span>Pair</span>
                                <span></span>
                                <span>Strategy</span>
                                <span>Direction</span>
                                <span>Timeframe</span>
                                <span>Price</span>
                                <span>Status</span>
                            </div>

                            {filteredSignals.map((signal, idx) => {
                                const isBuy = signal.signalType === 'BUY';
                                return (
                                    <motion.div
                                        key={signal.id || idx}
                                        variants={listItemVariants}
                                        custom={idx}
                                        onClick={() => navigate(`/signals/${signal.id}`)}
                                        className="grid grid-cols-[60px_auto_1fr_120px_100px_100px_120px_100px] gap-2 px-6 py-4 border-b dark:border-white/5 light:border-green-100 dark:hover:bg-white/[0.03] light:hover:bg-green-50/50 cursor-pointer transition-colors items-center group relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                        
                                        <div className="relative z-10">
                                            <FavoriteStar symbol={signal.symbol} />
                                        </div>
                                        <SymbolAvatar symbol={signal.symbol} />
                                        <div className="flex flex-col min-w-0 relative z-10">
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-base font-black dark:text-white light:text-text-dark tracking-tight truncate group-hover:text-amber-400 transition-colors">
                                                    {signal.symbol.replace('USDT', '/USDT')}
                                                </span>
                                                <TelegramAlertsCoinIcon
                                                    hasAlerts={symbolsWithTelegramAlerts.has(signal.symbol.toUpperCase())}
                                                />
                                            </span>
                                            <div className="text-[10px] dark:text-gray-500 light:text-slate-500 font-mono mt-0.5">
                                                <TimeDisplay date={signal.detectedAt} timeframe={signal.timeframe} format="full" showUtcLabel={false} />
                                            </div>
                                        </div>

                                        <div className="relative z-10 flex items-center">
                                            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider whitespace-nowrap
                                              dark:bg-white/5 dark:border-white/10 dark:text-gray-300
                                              light:bg-slate-100 light:border-slate-200 light:text-slate-700 border">
                                                {signal.strategyType.replace('_', ' ')}
                                            </span>
                                        </div>

                                        <div className="relative z-10">
                                            <div className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${isBuy
                                                ? 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)] light:bg-emerald-100 light:text-emerald-800 light:border-emerald-200'
                                                : 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)] light:bg-red-100 light:text-red-800 light:border-red-200'}`}>
                                                <span className="material-symbols-outlined text-[12px]">{isBuy ? 'trending_up' : 'trending_down'}</span>
                                                {isBuy ? 'LONG' : 'SHORT'}
                                            </div>
                                        </div>

                                        <div className="relative z-10">
                                            <span className="w-10 h-7 flex items-center justify-center rounded text-xs font-bold font-mono border
                                              dark:bg-black/40 dark:border-white/5 dark:text-gray-300
                                              light:bg-slate-100 light:border-slate-200 light:text-slate-700">
                                                {signal.timeframe.toUpperCase()}
                                            </span>
                                        </div>

                                        <span className="text-sm font-bold dark:text-white light:text-text-dark font-mono relative z-10 group-hover:text-amber-400 transition-colors">
                                            ${formatPrice(signal.price)}
                                        </span>

                                        <div className="relative z-10">
                                            <SignalStatusBadge signal={signal} />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                        <div className="md:hidden flex flex-col gap-3">
                            {filteredSignals.map((signal, idx) => {
                                const isBuy = signal.signalType === 'BUY';
                                return (
                                    <motion.button
                                        key={signal.id || idx}
                                        type="button"
                                        variants={listItemVariants}
                                        custom={idx}
                                        onClick={() => navigate(`/signals/${signal.id}`)}
                                        className="text-left glass-panel rounded-2xl p-4 border dark:border-white/5 light:border-slate-200 shadow-sm active:scale-[0.99] transition-transform"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="pt-0.5">
                                                <FavoriteStar symbol={signal.symbol} />
                                            </div>
                                            <SymbolAvatar symbol={signal.symbol} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="flex items-center gap-1.5 min-w-0 flex-1">
                                                        <span className="text-base font-black dark:text-white light:text-text-dark tracking-tight truncate">
                                                            {signal.symbol.replace('USDT', '/USDT')}
                                                        </span>
                                                        <TelegramAlertsCoinIcon
                                                            hasAlerts={symbolsWithTelegramAlerts.has(signal.symbol.toUpperCase())}
                                                        />
                                                    </span>
                                                    <span className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${isBuy
                                                        ? 'bg-green-500/10 text-green-400 border-green-500/20 light:bg-emerald-100 light:text-emerald-800 light:border-emerald-200'
                                                        : 'bg-red-500/10 text-red-400 border-red-500/20 light:bg-red-100 light:text-red-800 light:border-red-200'}`}>
                                                        <span className="material-symbols-outlined text-[12px]">{isBuy ? 'trending_up' : 'trending_down'}</span>
                                                        {isBuy ? 'LONG' : 'SHORT'}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-[10px] dark:text-gray-500 light:text-slate-500 font-mono">
                                                    <TimeDisplay date={signal.detectedAt} timeframe={signal.timeframe} format="full" showUtcLabel={false} />
                                                </div>

                                                <div className="mt-3 grid grid-cols-3 gap-2 items-center">
                                                    <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider whitespace-nowrap
                                                      dark:bg-white/5 dark:border-white/10 dark:text-gray-300
                                                      light:bg-slate-100 light:border-slate-200 light:text-slate-700 border truncate">
                                                        {signal.strategyType.replace('_', ' ')}
                                                    </span>

                                                    <span className="w-full h-7 inline-flex items-center justify-center rounded text-xs font-bold font-mono border
                                                      dark:bg-black/40 dark:border-white/5 dark:text-gray-300
                                                      light:bg-slate-100 light:border-slate-200 light:text-slate-700">
                                                        {signal.timeframe.toUpperCase()}
                                                    </span>

                                                    <span className="text-sm font-bold dark:text-white light:text-text-dark font-mono text-right">
                                                        ${formatPrice(signal.price)}
                                                    </span>
                                                </div>

                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                    <SignalStatusBadge signal={signal} />
                                                    <span className="material-symbols-outlined text-[18px] dark:text-gray-600 light:text-slate-400">chevron_right</span>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
