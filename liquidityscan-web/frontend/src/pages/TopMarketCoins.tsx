import { useMemo, useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchSignals, fetchRsiDivergenceSignalsUnion } from '../services/signalsApi';
import { useMarketCapData, CoinMarketData } from '../hooks/useMarketCapData';
import { useTierGating } from '../hooks/useTierGating';
import { Signal, StrategyType } from '../types';
import { staggerContainer, listItemVariants } from '../utils/animations';
import { PageHero } from '../components/shared/PageHero';

const STRATEGY_ORDER: StrategyType[] = [
    'SUPER_ENGULFING',
    'ICT_BIAS',
    'RSIDIVERGENCE',
    'CRT',
    '3OB',
];

const STRATEGY_LABEL: Record<StrategyType, string> = {
    SUPER_ENGULFING: 'Super Engulfing',
    ICT_BIAS: 'ICT Bias',
    RSIDIVERGENCE: 'RSI Divergence',
    CRT: 'CRT',
    '3OB': '3-OB',
    CISD: 'CISD',
};

const FEATURE_KEY: Record<StrategyType, string> = {
    SUPER_ENGULFING: 'super_engulfing',
    ICT_BIAS: 'ict_bias',
    RSIDIVERGENCE: 'rsi_divergence',
    CRT: 'crt',
    '3OB': '3_ob',
    CISD: 'cisd',
};

function toBinanceSymbol(base: string): string {
    const b = base.toUpperCase().trim();
    if (b.endsWith('USDT')) return b;
    return `${b}USDT`;
}

function isActiveSignal(s: Signal): boolean {
    return s.status === 'ACTIVE';
}

export function TopMarketCoins() {
    const { topCoins, isLoading: cmcLoading } = useMarketCapData();
    const { hasFullProductAccess, isSymbolAllowed, loading: tierLoading } = useTierGating();

    const canViewSymbol = useCallback(
        (binanceSymbol: string) => {
            if (hasFullProductAccess) return true;
            return (
                isSymbolAllowed(binanceSymbol, FEATURE_KEY.SUPER_ENGULFING) ||
                isSymbolAllowed(binanceSymbol, FEATURE_KEY.ICT_BIAS) ||
                isSymbolAllowed(binanceSymbol, FEATURE_KEY.RSIDIVERGENCE) ||
                isSymbolAllowed(binanceSymbol, FEATURE_KEY.CRT) ||
                isSymbolAllowed(binanceSymbol, FEATURE_KEY['3OB'])
            );
        },
        [hasFullProductAccess, isSymbolAllowed],
    );

    const { data: se = [], isLoading: l0 } = useQuery({
        queryKey: ['signals', 'SUPER_ENGULFING', 1000, 0],
        queryFn: () => fetchSignals('SUPER_ENGULFING', 1000, 0),
        staleTime: 60 * 1000,
        refetchInterval: 60 * 1000,
    });
    const { data: bias = [], isLoading: l1 } = useQuery({
        queryKey: ['signals', 'ICT_BIAS', 1000, 0],
        queryFn: () => fetchSignals('ICT_BIAS', 1000, 0),
        staleTime: 60 * 1000,
        refetchInterval: 60 * 1000,
    });
    const { data: rsi = [], isLoading: l2 } = useQuery({
        queryKey: ['signals', 'RSIDIVERGENCE', 1000, 0],
        queryFn: () => fetchRsiDivergenceSignalsUnion(1000, 0),
        staleTime: 60 * 1000,
        refetchInterval: 60 * 1000,
    });
    const { data: crt = [], isLoading: l3 } = useQuery({
        queryKey: ['signals', 'CRT', 1000, 0],
        queryFn: () => fetchSignals('CRT', 1000, 0),
        staleTime: 60 * 1000,
        refetchInterval: 60 * 1000,
    });
    const { data: ob3 = [], isLoading: l4 } = useQuery({
        queryKey: ['signals', '3OB', 1000, 0],
        queryFn: () => fetchSignals('3OB', 1000, 0),
        staleTime: 60 * 1000,
        refetchInterval: 60 * 1000,
    });

    const signalsLoading = l0 || l1 || l2 || l3 || l4;

    const signalsBySymbol = useMemo(() => {
        const map = new Map<string, Partial<Record<StrategyType, Signal[]>>>();
        const ingest = (list: Signal[], st: StrategyType) => {
            for (const s of list.filter(isActiveSignal)) {
                const cur = map.get(s.symbol) || {};
                const arr = cur[st] ? [...cur[st]!] : [];
                arr.push(s);
                cur[st] = arr;
                map.set(s.symbol, cur);
            }
        };
        ingest(se as Signal[], 'SUPER_ENGULFING');
        ingest(bias as Signal[], 'ICT_BIAS');
        ingest(rsi as Signal[], 'RSIDIVERGENCE');
        ingest(crt as Signal[], 'CRT');
        ingest(ob3 as Signal[], '3OB');
        return map;
    }, [se, bias, rsi, crt, ob3]);

    const [modalCoin, setModalCoin] = useState<CoinMarketData | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setModalCoin(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const modalBinanceSymbol = modalCoin ? toBinanceSymbol(modalCoin.symbol) : '';
    const modalStrategies = modalCoin
        ? signalsBySymbol.get(modalBinanceSymbol) || {}
        : {};

    const activeStrategyCountFor = (baseSymbol: string) => {
        const sym = toBinanceSymbol(baseSymbol);
        const entry = signalsBySymbol.get(sym);
        if (!entry) return 0;
        return STRATEGY_ORDER.filter((st) => (entry[st]?.length ?? 0) > 0).length;
    };

    const loading = cmcLoading || tierLoading;

    return (
        <motion.div
            className="flex flex-col h-full"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
        >
            <div className="px-4 md:px-6 pt-4 md:pt-6 shrink-0">
                <PageHero
                    eyebrow="Scanner · Market cap"
                    icon="leaderboard"
                    title="Top 50 · Market Cap"
                    subtitle="Tap a coin to see which scanners currently have an ACTIVE signal on that pair (SE / Bias / RSI / CRT / 3-OB)."
                    tone="primary"
                    unboxed
                />
            </div>

            <div className="flex-1 overflow-auto px-4 md:px-8 pb-8">
                {loading || signalsLoading ? (
                    <div className="flex items-center justify-center py-24 text-sm dark:text-gray-500 light:text-slate-500">
                        Loading market data…
                    </div>
                ) : topCoins.length === 0 ? (
                    <div className="glass-panel rounded-2xl p-12 text-center text-gray-500">Market cap data unavailable.</div>
                ) : (
                    <motion.div variants={listItemVariants} className="glass-panel rounded-2xl border dark:border-white/10 light:border-green-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="dark:bg-white/5 light:bg-green-50 border-b dark:border-white/10 light:border-green-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">
                                            #
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">
                                            Coin
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase hidden sm:table-cell">
                                            Name
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">
                                            Active scans
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-white/10 light:divide-green-100">
                                    {topCoins.map((coin) => {
                                        const binanceSymbol = toBinanceSymbol(coin.symbol);
                                        const locked = !canViewSymbol(binanceSymbol);
                                        const n = activeStrategyCountFor(coin.symbol);
                                        return (
                                            <tr
                                                key={coin.symbol + coin.market_cap_rank}
                                                className={`dark:hover:bg-white/5 light:hover:bg-green-50/50 transition-colors ${
                                                    locked ? 'cursor-not-allowed' : 'cursor-pointer'
                                                }`}
                                                onClick={() => {
                                                    if (!locked) setModalCoin(coin);
                                                }}
                                            >
                                                <td className="px-4 py-3 font-mono text-xs dark:text-gray-500 light:text-slate-500">
                                                    {coin.market_cap_rank}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div
                                                        className={`flex items-center gap-2 ${locked ? 'blur-[6px] select-none' : ''}`}
                                                    >
                                                        <span className="font-bold dark:text-white light:text-text-dark">
                                                            {coin.symbol.toUpperCase()}
                                                        </span>
                                                        {locked && (
                                                            <span
                                                                className="material-symbols-outlined text-amber-500 text-[14px]"
                                                                title="PRO or grant required"
                                                            >
                                                                lock
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td
                                                    className={`px-4 py-3 dark:text-gray-400 light:text-slate-600 hidden sm:table-cell max-w-[200px] truncate ${
                                                        locked ? 'blur-[6px]' : ''
                                                    }`}
                                                >
                                                    {coin.name}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span
                                                        className={`inline-flex min-w-[2rem] justify-center px-2 py-0.5 rounded-lg text-xs font-bold ${
                                                            n > 0
                                                                ? 'bg-primary/15 text-primary border border-primary/30'
                                                                : 'dark:bg-white/5 light:bg-slate-100 dark:text-gray-500 light:text-slate-500'
                                                        }`}
                                                    >
                                                        {n}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}
            </div>

            <AnimatePresence>
                {modalCoin && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                        onClick={() => setModalCoin(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 12 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                            className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border dark:border-white/10 light:border-green-200 dark:bg-[#0c1010] light:bg-white shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b dark:border-white/10 light:border-green-100">
                                <div>
                                    <h2 className="text-lg font-black dark:text-white light:text-text-dark">
                                        {modalCoin.symbol.toUpperCase()}
                                    </h2>
                                    <p className="text-xs dark:text-gray-500 light:text-slate-500">{modalCoin.name}</p>
                                    <p className="text-[11px] font-mono dark:text-gray-600 light:text-slate-400 mt-0.5">
                                        {modalBinanceSymbol}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setModalCoin(null)}
                                    className="w-9 h-9 rounded-xl dark:hover:bg-white/10 light:hover:bg-slate-100 flex items-center justify-center dark:text-gray-400 light:text-slate-500"
                                    aria-label="Close"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="p-5 overflow-y-auto max-h-[calc(85vh-88px)] custom-scrollbar">
                                {STRATEGY_ORDER.every((st) => !(modalStrategies[st]?.length ?? 0)) ? (
                                    <p className="text-sm dark:text-gray-400 light:text-slate-600 text-center py-8">
                                        No active signals on this pair right now.
                                    </p>
                                ) : (
                                    <div className="space-y-6">
                                        {STRATEGY_ORDER.map((st) => {
                                            const list = modalStrategies[st] ?? [];
                                            if (list.length === 0) return null;
                                            const sorted = [...list].sort(
                                                (a, b) =>
                                                    new Date(b.detectedAt).getTime() -
                                                    new Date(a.detectedAt).getTime(),
                                            );
                                            return (
                                                <div key={st}>
                                                    <h3 className="text-xs font-bold uppercase tracking-widest dark:text-gray-500 light:text-slate-500 mb-2">
                                                        {STRATEGY_LABEL[st]}
                                                    </h3>
                                                    <ul className="space-y-2">
                                                        {sorted.map((sig) => (
                                                            <li key={sig.id}>
                                                                <Link
                                                                    to={`/signals/${encodeURIComponent(sig.id)}`}
                                                                    onClick={() => setModalCoin(null)}
                                                                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 dark:bg-white/5 light:bg-green-50/80 border dark:border-white/10 light:border-green-200 hover:border-primary/40 transition-colors"
                                                                >
                                                                    <span className="text-xs font-mono dark:text-gray-400 light:text-slate-600">
                                                                        {sig.timeframe}
                                                                    </span>
                                                                    <span
                                                                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                                                                            sig.signalType === 'BUY'
                                                                                ? 'bg-green-500/15 text-green-400'
                                                                                : 'bg-red-500/15 text-red-400'
                                                                        }`}
                                                                    >
                                                                        {sig.signalType === 'BUY' ? 'LONG' : 'SHORT'}
                                                                    </span>
                                                                    <span className="text-xs text-primary font-semibold ml-auto">
                                                                        Open →
                                                                    </span>
                                                                </Link>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
