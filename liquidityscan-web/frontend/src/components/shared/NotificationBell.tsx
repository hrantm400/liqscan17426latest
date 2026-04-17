import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore } from '../../store/notificationStore';
import { useNavigate } from 'react-router-dom';
import { formatRelativeTimeAgo } from '../../utils/formatRelativeTime';

export const NotificationBell: React.FC = () => {
    const {
        notifications,
        unreadCount,
        markAllRead,
        clearAll,
        soundEnabled,
        setSoundEnabled,
        toastPopupsEnabled,
        setToastPopupsEnabled,
    } = useNotificationStore();
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleOpen = () => {
        setIsOpen(!isOpen);
        if (!isOpen) {
            // Mark all as read when opening
            markAllRead();
        }
    };

    return (
        <div className="relative" ref={panelRef}>
            {/* Bell Button */}
            <button
                onClick={handleOpen}
                className="relative w-10 h-10 rounded-xl dark:bg-white/5 light:bg-slate-100 dark:hover:bg-white/10 light:hover:bg-slate-200 flex items-center justify-center transition-all border dark:border-white/10 light:border-slate-200 group"
                title="Notifications"
            >
                <span className={`material-symbols-outlined text-[20px] transition-colors ${
                    unreadCount > 0 
                        ? 'dark:text-primary light:text-green-600' 
                        : 'dark:text-gray-400 light:text-slate-500 group-hover:text-primary'
                }`}
                    style={unreadCount > 0 ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                    notifications
                </span>
                
                {/* Badge */}
                {unreadCount > 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg"
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                )}
            </button>

            {/* Dropdown Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="fixed md:absolute inset-x-4 md:inset-x-auto right-0 md:right-0 top-16 md:top-12 w-[calc(100vw-2rem)] md:w-[360px] max-h-[480px] flex flex-col dark:bg-[#0c1010]/95 light:bg-white/95 border dark:border-white/10 light:border-slate-200 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] light:shadow-[0_20px_60px_rgba(0,0,0,0.12)] backdrop-blur-xl overflow-hidden z-50"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-white/5 light:border-slate-100">
                            <h3 className="text-sm font-bold dark:text-white light:text-slate-900">Notifications</h3>
                            <div className="flex items-center gap-2">
                                {/* In-app popup toasts */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setToastPopupsEnabled(!toastPopupsEnabled);
                                    }}
                                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                                        toastPopupsEnabled
                                        ? 'dark:text-white light:text-slate-800 dark:bg-white/10 light:bg-slate-200'
                                        : 'dark:text-gray-500 light:text-slate-400 dark:hover:bg-white/5 light:hover:bg-slate-100'
                                    }`}
                                    title={toastPopupsEnabled ? 'Turn off floating popups' : 'Turn on floating popups'}
                                >
                                    <span className="material-symbols-outlined text-[16px] leading-none">
                                        {toastPopupsEnabled ? 'view_carousel' : 'hide_image'}
                                    </span>
                                </button>
                                {/* Sound Toggle */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSoundEnabled(!soundEnabled);
                                    }}
                                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                                        soundEnabled 
                                        ? 'dark:text-white light:text-slate-800 dark:bg-white/10 light:bg-slate-200' 
                                        : 'dark:text-gray-500 light:text-slate-400 dark:hover:bg-white/5 light:hover:bg-slate-100'
                                    }`}
                                    title={soundEnabled ? "Mute alert sounds" : "Enable alert sounds"}
                                >
                                    <span className="material-symbols-outlined text-[16px] leading-none">
                                        {soundEnabled ? 'volume_up' : 'volume_off'}
                                    </span>
                                </button>
                                
                                {notifications.length > 0 && (
                                    <button
                                        onClick={clearAll}
                                        className="text-[10px] font-medium dark:text-gray-500 light:text-slate-400 dark:hover:text-red-400 light:hover:text-red-500 transition-colors uppercase tracking-wider"
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Notification List */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <span className="material-symbols-outlined text-4xl dark:text-gray-600 light:text-slate-300">notifications_none</span>
                                    <p className="text-sm dark:text-gray-500 light:text-slate-400">No notifications yet</p>
                                    <p className="text-[11px] dark:text-gray-600 light:text-slate-400 text-center max-w-[240px]">
                                        New signal alerts will appear here when detected by the scanner
                                    </p>
                                </div>
                            ) : (
                                <div className="p-2 flex flex-col gap-0.5">
                                    {notifications.map((notif) => (
                                        <button
                                            key={notif.id}
                                            onClick={() => {
                                                // Navigate to the appropriate monitor
                                                const stratMap: Record<string, string> = {
                                                    'SUPER_ENGULFING': '/monitor/superengulfing',
                                                    'ICT_BIAS': '/monitor/bias',
                                                    'RSIDIVERGENCE': '/monitor/rsi',
                                                    'CRT': '/monitor/crt',
                                                    '3OB': '/monitor/3ob',
                                                    'CISD': '/monitor/cisd',
                                                };
                                                const path = stratMap[notif.strategyType] || '/dashboard';
                                                navigate(`${path}?search=${notif.symbol.replace('USDT', '')}`);
                                                setIsOpen(false);
                                            }}
                                            className={`w-full text-left px-3 py-3 rounded-xl transition-all flex items-start gap-3 group/item ${
                                                notif.read 
                                                    ? 'dark:hover:bg-white/5 light:hover:bg-slate-50' 
                                                    : 'dark:bg-primary/5 light:bg-green-50/60 dark:hover:bg-primary/10 light:hover:bg-green-50'
                                            }`}
                                        >
                                            {/* Direction Indicator */}
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                                notif.direction === 'LONG' 
                                                    ? 'bg-green-500/10 text-green-500' 
                                                    : 'bg-red-500/10 text-red-500'
                                            }`}>
                                                <span className="material-symbols-outlined text-[16px]">
                                                    {notif.direction === 'LONG' ? 'trending_up' : 'trending_down'}
                                                </span>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold dark:text-white light:text-slate-900 truncate">
                                                        {notif.symbol.replace('USDT', '')}
                                                    </span>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                        notif.direction === 'LONG'
                                                            ? 'bg-green-500/10 text-green-500'
                                                            : 'bg-red-500/10 text-red-500'
                                                    }`}>
                                                        {notif.direction}
                                                    </span>
                                                    <span className="text-[10px] dark:text-gray-500 light:text-slate-400 font-mono">
                                                        {notif.timeframe}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] dark:text-gray-500 light:text-slate-400 mt-0.5 truncate">
                                                    {notif.title}
                                                </p>
                                            </div>

                                            <span className="text-[10px] dark:text-gray-600 light:text-slate-400 font-mono shrink-0 mt-1">
                                                {formatRelativeTimeAgo(new Date(notif.timestamp))}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
