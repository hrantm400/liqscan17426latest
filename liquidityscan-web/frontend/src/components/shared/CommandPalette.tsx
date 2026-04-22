import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const PAGES = [
    { id: 'dashboard', name: 'Dashboard', icon: 'dashboard', path: '/dashboard', category: 'Pages' },
    { id: 'watchlist', name: 'Watchlist', icon: 'star', path: '/watchlist', category: 'Pages' },
    { id: 'top-coins', name: 'Top 50 (market cap)', icon: 'leaderboard', path: '/top-coins', category: 'Pages' },
    { id: 'monitor-se', name: 'SuperEngulfing Monitor', icon: 'candlestick_chart', path: '/monitor/superengulfing', category: 'Monitors' },
    { id: 'monitor-bias', name: 'Bias Shifts Monitor', icon: 'timeline', path: '/monitor/bias', category: 'Monitors' },
    { id: 'monitor-rsi', name: 'RSI Divergence Monitor', icon: 'hub', path: '/monitor/rsi', category: 'Monitors' },
    { id: 'monitor-crt', name: 'CRT Monitor', icon: 'target', path: '/monitor/crt', category: 'Monitors' },
    { id: 'monitor-3ob', name: '3-OB Monitor', icon: 'layers', path: '/monitor/3ob', category: 'Monitors' },
    { id: 'monitor-cisd', name: 'CISD Monitor', icon: 'change_circle', path: '/monitor/cisd', category: 'Monitors' },
    { id: 'core-layer', name: 'Core-Layer Overview', icon: 'grain', path: '/core-layer', category: 'Core-Layer' },
    { id: 'core-layer-se', name: 'SE Core-Layer', icon: 'grain', path: '/core-layer/se', category: 'Core-Layer' },
    { id: 'core-layer-crt', name: 'CRT Core-Layer', icon: 'radar', path: '/core-layer/crt', category: 'Core-Layer' },
    { id: 'core-layer-bias', name: 'Bias Core-Layer', icon: 'stacked_line_chart', path: '/core-layer/bias', category: 'Core-Layer' },
    { id: 'strategies', name: 'Strategies', icon: 'architecture', path: '/strategies', category: 'Pages' },
    { id: 'tools', name: 'Tools', icon: 'handyman', path: '/tools', category: 'Pages' },
    { id: 'calculator', name: 'Risk Calculator', icon: 'calculate', path: '/risk-calculator', category: 'Tools' },
    { id: 'daily-recap', name: 'Daily Recap', icon: 'summarize', path: '/daily-recap', category: 'Pages' },
    { id: 'academy', name: 'Academy', icon: 'school', path: '/courses', category: 'Pages' },
    { id: 'subscription', name: 'Subscription', icon: 'card_membership', path: '/subscription', category: 'Pages' },
    { id: 'settings', name: 'Settings', icon: 'settings', path: '/settings', category: 'Settings' },
    { id: 'profile', name: 'Profile', icon: 'person', path: '/profile', category: 'Settings' },
    { id: 'support', name: 'Support', icon: 'help_center', path: '/support', category: 'Settings' },
];

// Popular symbols for quick navigation
const POPULAR_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'DOTUSDT', 'AVAXUSDT', 'MATICUSDT',
    'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT',
    'APTUSDT', 'ARBUSDT', 'OPUSDT', 'SUIUSDT', 'PEPEUSDT',
    'XAUUSDT', 'XAGUSDT', 'EURUSDT', 'GBPUSDT',
];

interface SearchResult {
    id: string;
    name: string;
    icon: string;
    path?: string;
    action?: () => void;
    category: string;
    subtitle?: string;
}

export function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    // Handle "/" key to open palette (like GitHub/Slack)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger when typing in input/textarea/contenteditable
            const tag = (e.target as HTMLElement)?.tagName;
            const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;

            if (e.key === '/' && !isEditable && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const navigateToSymbol = useCallback((symbol: string, monitorPath: string) => {
        // Navigate to the selected monitor with symbol as search query
        navigate(`${monitorPath}?search=${symbol.toUpperCase()}`);
    }, [navigate]);

    const filteredItems = React.useMemo((): SearchResult[] => {
        const query = searchQuery.toLowerCase().trim();
        
        if (!query) {
            // Show default suggestions
            return PAGES.slice(0, 8).map(p => ({ ...p, subtitle: p.path }));
        }

        // Match Pages
        const matchedPages: SearchResult[] = PAGES.filter(p => 
            p.name.toLowerCase().includes(query) || p.id.includes(query)
        ).map(p => ({ ...p, subtitle: p.path }));

        // Match symbols from the popular list, or use the raw query if it looks like a symbol
        const isSymbolLike = query.length >= 2 && query.length <= 10 && /^[a-zA-Z]+$/.test(query);
        const popularMatch = POPULAR_SYMBOLS.find(s => s.toLowerCase().includes(query) || s.replace('USDT', '').toLowerCase().includes(query));
        
        const targetSymbol = popularMatch || (isSymbolLike ? query.toUpperCase() + (query.toUpperCase().endsWith('USDT') ? '' : 'USDT') : null);

        const symbolOptions: SearchResult[] = targetSymbol ? [
            {
                id: `symbol-${targetSymbol}-se`,
                name: `Search ${targetSymbol.replace('USDT', '')} in SuperEngulfing`,
                icon: 'candlestick_chart',
                category: 'Symbol Scans',
                action: () => navigateToSymbol(targetSymbol, '/monitor/superengulfing'),
            },
            {
                id: `symbol-${targetSymbol}-bias`,
                name: `Search ${targetSymbol.replace('USDT', '')} in Bias`,
                icon: 'timeline',
                category: 'Symbol Scans',
                action: () => navigateToSymbol(targetSymbol, '/monitor/bias'),
            },
            {
                id: `symbol-${targetSymbol}-rsi`,
                name: `Search ${targetSymbol.replace('USDT', '')} in RSI Divergence`,
                icon: 'hub',
                category: 'Symbol Scans',
                action: () => navigateToSymbol(targetSymbol, '/monitor/rsi'),
            },
            {
                id: `symbol-${targetSymbol}-crt`,
                name: `Search ${targetSymbol.replace('USDT', '')} in CRT`,
                icon: 'target',
                category: 'Symbol Scans',
                action: () => navigateToSymbol(targetSymbol, '/monitor/crt'),
            },
            {
                id: `symbol-${targetSymbol}-3ob`,
                name: `Search ${targetSymbol.replace('USDT', '')} in 3-OB`,
                icon: 'layers',
                category: 'Symbol Scans',
                action: () => navigateToSymbol(targetSymbol, '/monitor/3ob'),
            },
        ] : [];

        return [...symbolOptions, ...matchedPages];
    }, [searchQuery, navigateToSymbol]);

    // Handle keyboard navigation within the palette
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (filteredItems.length === 0) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filteredItems.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = filteredItems[selectedIndex];
                if (item) {
                    if (item.action) {
                        item.action();
                    } else if (item.path) {
                        navigate(item.path);
                    }
                    setIsOpen(false);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, filteredItems, selectedIndex, navigate]);

    // Group items by category
    const groupedItems = React.useMemo(() => {
        const groups: Record<string, { items: SearchResult[]; startIndex: number }> = {};
        let idx = 0;
        for (const item of filteredItems) {
            if (!groups[item.category]) {
                groups[item.category] = { items: [], startIndex: idx };
            }
            groups[item.category].items.push(item);
            idx++;
        }
        return groups;
    }, [filteredItems]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsOpen(false)}
                    className="absolute inset-0 dark:bg-black/60 light:bg-black/30 backdrop-blur-sm"
                />

                {/* Palette */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="relative w-full max-w-2xl dark:bg-[#0a0e0b]/95 light:bg-white/95 border dark:border-white/10 light:border-slate-200 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] light:shadow-[0_25px_50px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col backdrop-blur-xl"
                >
                    {/* Input Area */}
                    <div className="flex items-center px-5 py-4 border-b dark:border-white/10 light:border-slate-200">
                        <span className="material-symbols-outlined dark:text-gray-500 light:text-slate-400 mr-3 text-xl">search</span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => {
                                setSearchQuery(e.target.value);
                                setSelectedIndex(0);
                            }}
                            placeholder="Search pages, symbols (BTC, ETH, SOL...)..."
                            className="flex-1 bg-transparent border-none dark:text-white light:text-slate-900 text-lg dark:placeholder:text-gray-500 light:placeholder:text-slate-400 focus:outline-none focus:ring-0"
                        />
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md dark:bg-white/5 light:bg-slate-100 border dark:border-white/10 light:border-slate-200 text-[10px] dark:text-gray-400 light:text-slate-500 font-mono">
                            <span>ESC</span>
                        </div>
                    </div>

                    {/* Results Area */}
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
                        {filteredItems.length === 0 ? (
                            <div className="py-14 text-center dark:text-gray-500 light:text-slate-400 text-sm">
                                No results found for "{searchQuery}"
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {Object.entries(groupedItems).map(([category, { items, startIndex }]) => (
                                    <div key={category}>
                                        <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] dark:text-gray-600 light:text-slate-400">
                                            {category}
                                        </div>
                                        {items.map((item, i) => {
                                            const globalIndex = startIndex + i;
                                            return (
                                                <div
                                                    key={item.id}
                                                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                                                    onClick={() => {
                                                        if (item.action) {
                                                            item.action();
                                                        } else if (item.path) {
                                                            navigate(item.path);
                                                        }
                                                        setIsOpen(false);
                                                    }}
                                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-150 ${
                                                        globalIndex === selectedIndex
                                                            ? 'dark:bg-primary/15 light:bg-green-50 border dark:border-primary/30 light:border-green-300 dark:text-white light:text-slate-900 shadow-sm'
                                                            : 'dark:text-gray-400 light:text-slate-500 dark:hover:bg-white/5 light:hover:bg-slate-50 dark:hover:text-white light:hover:text-slate-900 border border-transparent'
                                                    }`}
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                                        globalIndex === selectedIndex
                                                            ? 'dark:bg-primary/20 light:bg-green-100 text-primary'
                                                            : 'dark:bg-white/5 light:bg-slate-100 dark:text-gray-500 light:text-slate-400'
                                                    }`}>
                                                        <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                                                    </div>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className={`font-semibold text-sm truncate ${
                                                            globalIndex === selectedIndex
                                                                ? 'dark:text-white light:text-slate-900'
                                                                : 'dark:text-gray-300 light:text-slate-600'
                                                        }`}>
                                                            {item.name}
                                                        </span>
                                                        {item.subtitle && (
                                                            <span className="text-[10px] dark:text-gray-600 light:text-slate-400 font-mono mt-0.5 truncate">
                                                                {item.subtitle}
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {globalIndex === selectedIndex && (
                                                        <span className="material-symbols-outlined ml-auto text-primary text-sm shrink-0">keyboard_return</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {/* Footer */}
                    <div className="hidden md:flex items-center justify-between px-4 py-3 dark:bg-white/[0.02] light:bg-slate-50 border-t dark:border-white/5 light:border-slate-200 text-[10px] dark:text-gray-500 light:text-slate-400">
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded dark:bg-white/10 light:bg-slate-200 font-mono">↑</kbd><kbd className="px-1.5 py-0.5 rounded dark:bg-white/10 light:bg-slate-200 font-mono">↓</kbd> navigate</span>
                            <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded dark:bg-white/10 light:bg-slate-200 font-mono">↵</kbd> select</span>
                        </div>
                        <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-primary">bolt</span>
                            Quick actions
                        </span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
