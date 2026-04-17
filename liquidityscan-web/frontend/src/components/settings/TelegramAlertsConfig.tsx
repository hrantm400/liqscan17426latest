import { useState, useEffect } from 'react';
import { userApi } from '../../services/userApi';
import { toast } from 'react-hot-toast';
import { useTierGating } from '../../hooks/useTierGating';

interface AlertSubscription {
    id: string;
    symbol: string;
    strategyType: string;
    timeframes: string[] | null;
    directions: string[] | null;
    minWinRate?: number | null;
    isActive: boolean;
    createdAt: string;
}

type StrategyOption = {
    value: string;
    label: string;
    icon: string;
    color: string;
    desc: string;
    allowedTimeframes: string[];
};

const COMMON_COINS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT'];

function timeframesForEdit(alert: AlertSubscription, options: StrategyOption[]): string[] {
    const key = alert.strategyType;
    return options.find((o) => o.value === key)?.allowedTimeframes ?? ['4h', '1h', '1d', '1w'];
}

export function TelegramAlertsConfig() {
    const { hasFullProductAccess: isTierPaid, isSymbolAllowed } = useTierGating();
    const [telegramId, setTelegramId] = useState('');
    const [isSavedTelegramId, setIsSavedTelegramId] = useState(false);
    const [alerts, setAlerts] = useState<AlertSubscription[]>([]);
    const [strategyOptions, setStrategyOptions] = useState<StrategyOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Per-strategy add form
    const [addingFor, setAddingFor] = useState<string | null>(null);
    const [newSymbol, setNewSymbol] = useState('');
    const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>([]);
    const [selectedDirections, setSelectedDirections] = useState<string[]>([]);

    // Editing
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTimeframes, setEditTimeframes] = useState<string[]>([]);
    const [editDirections, setEditDirections] = useState<string[]>([]);

    // Expanded strategy
    const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
    const [linkPoll, setLinkPoll] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    useEffect(() => { fetchData(); }, []);

    // After opening t.me link, detect when bot linked the account
    useEffect(() => {
        if (!linkPoll) return;
        const tick = async () => {
            try {
                const r = await userApi.getTelegramId();
                if (r.telegramId) {
                    setTelegramId(r.telegramId);
                    setIsSavedTelegramId(true);
                    setLinkPoll(false);
                    toast.success('Telegram connected');
                }
            } catch {
                /* ignore */
            }
        };
        tick();
        const id = setInterval(tick, 2500);
        const stop = setTimeout(() => setLinkPoll(false), 120_000);
        return () => {
            clearInterval(id);
            clearTimeout(stop);
        };
    }, [linkPoll]);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [tgRes, alertsRes] = await Promise.all([
                userApi.getTelegramId(),
                userApi.getAlerts(),
            ]);
            if (tgRes.telegramId) {
                setTelegramId(tgRes.telegramId);
                setIsSavedTelegramId(true);
            } else {
                setTelegramId('');
                setIsSavedTelegramId(false);
            }
            setAlerts(alertsRes);
            try {
                const optRes = await userApi.getAlertStrategyOptions();
                setStrategyOptions(optRes.strategies ?? []);
            } catch {
                setStrategyOptions([]);
                toast.error('Could not load alert strategy list — refresh the page.');
            }
        } catch (e: any) {
            if (e?.name === 'AuthExpiredError' || String(e?.message || '').toLowerCase().includes('session expired')) {
                toast.error('Session expired — please log in again');
            } else {
                toast.error(e?.message || 'Failed to load data');
            }
        }
        finally { setIsLoading(false); }
    };

    const saveTelegramId = async () => {
        if (!telegramId.trim()) { toast.error('Enter a valid Telegram ID'); return; }
        try {
            await userApi.saveTelegramId(telegramId.trim());
            setIsSavedTelegramId(true);
            toast.success('Telegram ID saved!');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save');
        }
    };

    const openTelegramLink = async () => {
        try {
            const { openUrl } = await userApi.createTelegramLink();
            setLinkPoll(true);
            window.open(openUrl, '_blank', 'noopener,noreferrer');
            toast('Telegram opened — tap Start in the bot, then wait a few seconds here.', { duration: 5000 });
        } catch (e: any) {
            toast.error(e?.message || 'Could not create link');
        }
    };

    const disconnectTelegram = async () => {
        if (!window.confirm('Unlink Telegram from this account? Saved alert rules stay on the site; you will not receive messages until you connect again.')) {
            return;
        }
        try {
            setDisconnecting(true);
            await userApi.disconnectTelegram();
            setTelegramId('');
            setIsSavedTelegramId(false);
            toast.success('Telegram unlinked');
        } catch (e: any) {
            toast.error(e?.message || 'Failed to unlink');
        } finally {
            setDisconnecting(false);
        }
    };

    const createAlert = async (strategyType: string) => {
        if (!newSymbol.trim()) { toast.error('Enter a coin symbol'); return; }
        let sym = newSymbol.trim().toUpperCase();
        if (!sym.endsWith('USDT') && !sym.endsWith('USD')) sym += 'USDT';
        if (!isTierPaid && !isSymbolAllowed(sym)) {
            toast.error('This coin is available for PRO only. Upgrade to unlock all Telegram alerts.');
            return;
        }
        try {
            const res = await userApi.createAlert(
                sym, strategyType,
                selectedTimeframes.length > 0 ? selectedTimeframes : undefined,
                selectedDirections.length > 0 ? selectedDirections : undefined,
            );
            setAlerts([res, ...alerts]);
            setNewSymbol('');
            setSelectedTimeframes([]);
            setSelectedDirections([]);
            setAddingFor(null);
            toast.success(`Tracking ${sym} on ${strategyOptions.find(s => s.value === strategyType)?.label || strategyType}`);
        } catch (error: any) { toast.error(error.response?.data?.message || 'Failed to create'); }
    };

    const toggleActive = async (alert: AlertSubscription) => {
        try {
            const updated = await userApi.updateAlert(alert.id, { isActive: !alert.isActive });
            setAlerts(alerts.map(a => a.id === alert.id ? updated : a));
            toast.success(updated.isActive ? 'Activated' : 'Paused');
        } catch { toast.error('Failed to update'); }
    };

    const saveEdits = async (alert: AlertSubscription) => {
        try {
            const updated = await userApi.updateAlert(alert.id, {
                timeframes: editTimeframes.length > 0 ? editTimeframes : undefined,
                directions: editDirections.length > 0 ? editDirections : undefined,
            });
            setAlerts(alerts.map(a => a.id === alert.id ? updated : a));
            setEditingId(null);
            toast.success('Filters updated');
        } catch { toast.error('Failed to save'); }
    };

    const deleteAlert = async (id: string) => {
        try {
            await userApi.deleteAlert(id);
            setAlerts(alerts.filter(a => a.id !== id));
            toast.success('Alert removed');
        } catch { toast.error('Failed to delete'); }
    };

    const toggle = (val: string, list: string[], setList: (v: string[]) => void) => {
        setList(list.includes(val) ? list.filter(v => v !== val) : [...list, val]);
    };

    const alertsFor = (strategyValue: string) =>
        alerts.filter((a) => a.strategyType === strategyValue);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[200px] w-full rounded-xl">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 w-full animate-fade-in relative z-10 px-0 mt-8 pt-8 border-t dark:border-white/10 light:border-slate-200">

            {/* ── HEADER ── */}
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-primary/20 flex items-center justify-center border dark:border-white/10 light:border-slate-200 shadow-lg">
                    <span className="material-symbols-outlined text-2xl text-blue-400">notifications_active</span>
                </div>
                <div>
                    <h2 className="text-xl font-bold dark:text-white light:text-text-dark">Telegram Signal Alerts</h2>
                    <p className="dark:text-gray-500 light:text-slate-500 text-xs mt-0.5">
                        Per scanner: pick coins, optional timeframe subset, and direction. Leave all timeframes unchecked to receive alerts on every timeframe that scanner runs on.
                    </p>
                </div>
            </div>

            {/* ── TELEGRAM CONNECTION ── */}
            <div className="glass-panel p-5 rounded-2xl border dark:border-white/5 light:border-green-300 dark:bg-surface-dark/60 light:bg-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-blue-400 text-sm">send</span>
                    </div>
                    <h3 className="text-base font-bold dark:text-white light:text-slate-900">Connect Telegram</h3>
                    {!isTierPaid && (
                        <span className="ml-auto text-[10px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/25 font-bold tracking-wide">
                            FREE: BTC/ETH/XAU/XAG only
                        </span>
                    )}
                    {isSavedTelegramId && (
                        <span className="ml-auto flex items-center gap-2 shrink-0">
                            <span className="text-[10px] px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/20 font-bold tracking-wide">CONNECTED</span>
                            <button
                                type="button"
                                disabled={disconnecting}
                                onClick={disconnectTelegram}
                                className="text-[10px] px-2.5 py-1 rounded-full border border-red-500/40 text-red-400 hover:bg-red-500/10 font-bold tracking-wide disabled:opacity-50"
                            >
                                {disconnecting ? '…' : 'Unlink'}
                            </button>
                        </span>
                    )}
                </div>
                <p className="text-xs dark:text-gray-400 light:text-slate-500 leading-relaxed mb-3">
                    <span className="font-semibold text-primary">Recommended:</span> connect in one tap — we open the bot with a secure link; press{' '}
                    <code className="dark:bg-white/10 light:bg-slate-200 px-1.5 py-0.5 rounded text-[11px]">Start</code>{' '}
                    in Telegram. Link expires in 15 minutes.
                </p>
                <button
                    type="button"
                    onClick={openTelegramLink}
                    className="mb-4 w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#229ED9] hover:bg-[#1b8ec4] text-white text-sm font-bold shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                    <span className="text-lg leading-none">✈️</span>
                    Connect in Telegram
                </button>
                <p className="text-xs dark:text-gray-500 light:text-slate-500 leading-relaxed mb-4 border-t dark:border-white/10 light:border-slate-200 pt-3">
                    <span className="font-semibold">Manual:</span> open{' '}
                    <a
                        href="https://t.me/Liquidityscanio_bot"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline font-semibold"
                        title="Open Telegram bot"
                    >
                        t.me/Liquidityscanio_bot
                    </a>
                    , send{' '}
                    <code className="dark:bg-white/10 light:bg-slate-200 px-1.5 py-0.5 rounded text-[11px]">/start</code>
                    , copy your numeric Chat ID and paste below.
                </p>
                <div className="flex gap-2">
                    <input type="text" value={telegramId}
                        onChange={(e) => { setTelegramId(e.target.value); if (isSavedTelegramId) setIsSavedTelegramId(false); }}
                        placeholder="e.g. 123456789"
                        className="glass-input w-full px-3 py-2 rounded-lg text-sm border dark:border-white/10 light:border-slate-300" />
                    <button onClick={saveTelegramId}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${isSavedTelegramId
                            ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                            : 'bg-primary text-black hover:bg-primary-hover shadow-glow'}`}>
                        {isSavedTelegramId ? '✓ Saved' : 'Save'}
                    </button>
                </div>
            </div>

            {/* ── PER-STRATEGY SECTIONS ── */}
            <div className={`space-y-4 transition-all duration-500 ${!isSavedTelegramId ? 'opacity-30 pointer-events-none blur-[1px]' : ''}`}>
                {strategyOptions.length === 0 && (
                    <p className="text-center text-xs dark:text-gray-500 light:text-slate-500 py-6">
                        Strategy list not loaded. Refresh the page or sign in again.
                    </p>
                )}
                {strategyOptions.map((strategy) => {
                    const stratAlerts = alertsFor(strategy.value);
                    const isExpanded = expandedStrategy === strategy.value;
                    const isAddingHere = addingFor === strategy.value;

                    return (
                        <div key={strategy.value}
                            className={`glass-panel rounded-2xl border transition-all duration-300 dark:bg-surface-dark/60 light:bg-white relative overflow-hidden
                            ${isExpanded ? 'dark:border-primary/20 light:border-primary/30' : 'dark:border-white/5 light:border-green-300'}`}>

                            {/* Strategy Header */}
                            <button
                                onClick={() => setExpandedStrategy(isExpanded ? null : strategy.value)}
                                className="w-full p-5 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-colors">

                                {/* Icon */}
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 text-lg"
                                    style={{ background: `${strategy.color}12`, borderColor: `${strategy.color}25` }}>
                                    {strategy.icon}
                                </div>

                                {/* Label */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm dark:text-white light:text-slate-900">{strategy.label}</span>
                                        {stratAlerts.length > 0 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                                style={{ background: `${strategy.color}15`, color: strategy.color }}>
                                                {stratAlerts.filter(a => a.isActive).length} active
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] dark:text-gray-500 light:text-slate-400 mt-0.5">{strategy.desc}</p>
                                </div>

                                {/* Chevron */}
                                <span className={`material-symbols-outlined text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                    expand_more
                                </span>
                            </button>

                            {/* Expanded content */}
                            {isExpanded && (
                                <div className="px-5 pb-5 space-y-4 animate-fade-in border-t dark:border-white/5 light:border-slate-100 pt-4">

                                    {/* Tracked coins for this strategy */}
                                    {stratAlerts.length > 0 ? (
                                        <div className="space-y-2">
                                            {stratAlerts.map(alert => {
                                                const isEditing = editingId === alert.id;
                                                return (
                                                    <div key={alert.id}
                                                        className={`rounded-xl border transition-all duration-200 ${!alert.isActive ? 'opacity-40' : ''}
                                                        ${isEditing ? 'dark:border-primary/30 light:border-primary/30 shadow-[0_0_15px_rgba(19,236,55,0.06)]' : 'dark:border-white/5 light:border-slate-200'} dark:bg-white/[0.02] light:bg-slate-50/50`}>

                                                        <div className="p-3 flex items-center gap-3">
                                                            {/* Coin badge */}
                                                            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
                                                                style={{ background: `${strategy.color}10`, borderColor: `${strategy.color}20` }}>
                                                                <span className="text-[10px] font-black font-mono" style={{ color: strategy.color }}>
                                                                    {alert.symbol.substring(0, 3)}
                                                                </span>
                                                            </div>
                                                            {/* Info */}
                                                            <div className="flex-1 min-w-0">
                                                                <span className="font-bold text-sm dark:text-white light:text-slate-900 font-mono tracking-wide">{alert.symbol}</span>
                                                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                                    {alert.timeframes && (alert.timeframes as string[]).length > 0
                                                                        ? (alert.timeframes as string[]).map(tf => (
                                                                            <span key={tf} className="text-[9px] px-1.5 py-0.5 rounded dark:bg-white/5 light:bg-slate-100 dark:text-gray-400 light:text-slate-500 font-mono">{tf}</span>
                                                                        ))
                                                                        : <span className="text-[9px] px-1.5 py-0.5 rounded dark:bg-white/5 light:bg-slate-100 dark:text-gray-500 light:text-slate-400">All TF</span>
                                                                    }
                                                                    <span className="dark:text-gray-700 light:text-slate-300 text-[8px]">|</span>
                                                                    {alert.directions && (alert.directions as string[]).length > 0
                                                                        ? (alert.directions as string[]).map(d => (
                                                                            <span key={d} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${d === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{d}</span>
                                                                        ))
                                                                        : <span className="text-[9px] px-1.5 py-0.5 rounded dark:bg-white/5 light:bg-slate-100 dark:text-gray-500 light:text-slate-400">Both</span>
                                                                    }
                                                                </div>
                                                            </div>
                                                            {/* Actions */}
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button onClick={() => {
                                                                    if (isEditing) { setEditingId(null); }
                                                                    else { setEditingId(alert.id); setEditTimeframes((alert.timeframes as string[]) || []); setEditDirections((alert.directions as string[]) || []); }
                                                                }} className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${isEditing ? 'bg-primary/20 text-primary' : 'dark:text-gray-600 light:text-slate-400 hover:text-primary hover:bg-white/5'}`} title="Edit">
                                                                    <span className="material-symbols-outlined text-[14px]">{isEditing ? 'close' : 'tune'}</span>
                                                                </button>
                                                                <button onClick={() => toggleActive(alert)}
                                                                    className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${alert.isActive ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-500 hover:bg-yellow-500/10 hover:text-yellow-400'}`}
                                                                    title={alert.isActive ? 'Pause' : 'Resume'}>
                                                                    <span className="material-symbols-outlined text-[14px]">{alert.isActive ? 'pause_circle' : 'play_circle'}</span>
                                                                </button>
                                                                <button onClick={() => deleteAlert(alert.id)}
                                                                    className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 hover:bg-red-500/10 hover:text-red-400 transition-all" title="Delete">
                                                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Inline edit */}
                                                        {isEditing && (
                                                            <div className="px-3 pb-3 border-t dark:border-white/5 light:border-slate-200 pt-3 space-y-3 animate-fade-in">
                                                                <div>
                                                                    <label className="block text-[9px] font-bold dark:text-gray-500 light:text-slate-400 uppercase tracking-widest mb-1.5">Timeframes</label>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {timeframesForEdit(alert, strategyOptions).map((tf) => (
                                                                            <button key={tf} type="button" onClick={() => toggle(tf, editTimeframes, setEditTimeframes)}
                                                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider transition-all border ${editTimeframes.includes(tf)
                                                                                    ? 'bg-primary/20 text-primary border-primary/40'
                                                                                    : 'dark:bg-white/[0.03] light:bg-slate-50 dark:text-gray-500 light:text-slate-400 dark:border-white/5 light:border-slate-200'}`}>
                                                                                {tf}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[9px] font-bold dark:text-gray-500 light:text-slate-400 uppercase tracking-widest mb-1.5">Direction</label>
                                                                    <div className="flex gap-2">
                                                                        {(['BUY', 'SELL'] as const).map(dir => (
                                                                            <button key={dir} type="button" onClick={() => toggle(dir, editDirections, setEditDirections)}
                                                                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all border flex items-center justify-center gap-1 ${editDirections.includes(dir)
                                                                                    ? dir === 'BUY' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
                                                                                    : 'dark:bg-white/[0.03] light:bg-slate-50 dark:text-gray-500 light:text-slate-400 dark:border-white/5 light:border-slate-200'}`}>
                                                                                {dir === 'BUY' ? '▲' : '▼'} {dir}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <button onClick={() => saveEdits(alert)}
                                                                    className="w-full py-2 rounded-lg bg-primary/90 text-black font-bold text-[11px] hover:bg-primary flex items-center justify-center gap-1.5 transition-all">
                                                                    <span className="material-symbols-outlined text-sm">save</span> Save
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6">
                                            <p className="text-xs dark:text-gray-500 light:text-slate-400">No coins tracked for this strategy yet.</p>
                                        </div>
                                    )}

                                    {/* Add coin form (inline) */}
                                    {isAddingHere ? (
                                        <div className="rounded-xl border dark:border-primary/20 light:border-primary/30 p-4 space-y-4 dark:bg-white/[0.02] light:bg-primary/[0.02] animate-fade-in">
                                            <div>
                                                <label className="block text-[10px] font-bold dark:text-gray-500 light:text-slate-400 uppercase tracking-widest mb-1.5">Coin Symbol</label>
                                                <input type="text" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)}
                                                    placeholder="e.g. BTC"
                                                    className="glass-input w-full px-3 py-2 rounded-lg text-sm font-mono uppercase border dark:border-white/10 light:border-slate-300" />
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {COMMON_COINS.slice(0, 6).map(c => (
                                                        <span
                                                            key={c}
                                                            onClick={() => {
                                                                if (!isTierPaid && !isSymbolAllowed(c)) return;
                                                                setNewSymbol(c);
                                                            }}
                                                            className={`text-[10px] px-2 py-0.5 rounded-full transition-all border ${newSymbol === c
                                                                ? 'bg-primary/20 text-primary border-primary/40'
                                                                : !isTierPaid && !isSymbolAllowed(c)
                                                                    ? 'opacity-40 cursor-not-allowed dark:bg-white/5 light:bg-slate-100 dark:text-gray-500 light:text-slate-400 dark:border-white/5 light:border-slate-200'
                                                                    : 'cursor-pointer dark:bg-white/5 light:bg-slate-100 dark:text-gray-400 light:text-slate-500 dark:border-white/5 light:border-slate-200 hover:bg-primary/10 hover:text-primary'}`}
                                                        >
                                                            {c.replace('USDT', '')}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold dark:text-gray-500 light:text-slate-400 uppercase tracking-widest mb-1.5">
                                                    Timeframes <span className="text-[9px] font-normal normal-case">(empty = all scanner TFs)</span>
                                                </label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {strategy.allowedTimeframes.map((tf) => (
                                                        <button key={tf} type="button" onClick={() => toggle(tf, selectedTimeframes, setSelectedTimeframes)}
                                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider transition-all border ${selectedTimeframes.includes(tf)
                                                                ? 'bg-primary/20 text-primary border-primary/40 shadow-sm'
                                                                : 'dark:bg-white/[0.03] light:bg-slate-50 dark:text-gray-500 light:text-slate-400 dark:border-white/5 light:border-slate-200 hover:bg-primary/10'}`}>
                                                            {tf}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-bold dark:text-gray-500 light:text-slate-400 uppercase tracking-widest mb-1.5">
                                                    Direction <span className="text-[9px] font-normal normal-case">(empty = both)</span>
                                                </label>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => toggle('BUY', selectedDirections, setSelectedDirections)}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1 ${selectedDirections.includes('BUY')
                                                            ? 'bg-green-500/15 text-green-400 border-green-500/30'
                                                            : 'dark:bg-white/[0.03] light:bg-slate-50 dark:text-gray-500 light:text-slate-400 dark:border-white/5 light:border-slate-200'}`}>
                                                        ▲ BUY
                                                    </button>
                                                    <button type="button" onClick={() => toggle('SELL', selectedDirections, setSelectedDirections)}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1 ${selectedDirections.includes('SELL')
                                                            ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                                            : 'dark:bg-white/[0.03] light:bg-slate-50 dark:text-gray-500 light:text-slate-400 dark:border-white/5 light:border-slate-200'}`}>
                                                        ▼ SELL
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button onClick={() => createAlert(strategy.value)}
                                                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary/80 to-primary text-black font-bold text-xs transition-all hover:shadow-[0_0_15px_rgba(19,236,55,0.2)] flex items-center justify-center gap-1.5">
                                                    <span className="material-symbols-outlined text-sm">add_alert</span> Track
                                                </button>
                                                <button onClick={() => { setAddingFor(null); setNewSymbol(''); setSelectedTimeframes([]); setSelectedDirections([]); }}
                                                    className="px-4 py-2.5 rounded-xl dark:bg-white/5 light:bg-slate-100 dark:text-gray-400 light:text-slate-500 text-xs font-medium border dark:border-white/5 light:border-slate-200 hover:bg-white/10 transition-all">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => { setAddingFor(strategy.value); setNewSymbol(''); setSelectedTimeframes([]); setSelectedDirections([]); }}
                                            className="w-full py-2.5 rounded-xl dark:bg-white/[0.03] light:bg-slate-50 dark:text-gray-400 light:text-slate-500 text-xs font-medium border dark:border-white/5 light:border-slate-200 hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-all flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-sm">add</span>
                                            Add coin to {strategy.label}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
