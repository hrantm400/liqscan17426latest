import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationStore, NotificationItem } from '../../store/notificationStore';
import { useNavigate } from 'react-router-dom';

export const GlobalToastManager: React.FC = () => {
    const { notifications, markRead, toastPopupsEnabled } = useNotificationStore();
    const [activeToasts, setActiveToasts] = useState<NotificationItem[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        if (!toastPopupsEnabled) {
            setActiveToasts([]);
        }
    }, [toastPopupsEnabled]);

    // Watch for new notifications coming into the store
    useEffect(() => {
        if (!toastPopupsEnabled) return;

        // We only want to show toasts for newly arrived, unread notifications
        // A robust way is to check the timestamp: if it's less than 2 seconds old and unread, it's new
        const now = Date.now();
        const newNotifs = notifications.filter(n => !n.read && (now - n.timestamp) < 2000);
        
        if (newNotifs.length > 0) {
            setActiveToasts(prev => {
                // Add new ones, avoiding duplicates by ID
                const toAdd = newNotifs.filter(n => !prev.some(p => p.id === n.id));
                // Only keep maximum 3 toasts at a time to avoid screen clutter
                return [...toAdd, ...prev].slice(0, 3);
            });
        }
    }, [notifications, toastPopupsEnabled]);

    // Auto-remove toasts after 5 seconds
    useEffect(() => {
        if (activeToasts.length === 0) return;

        const interval = setInterval(() => {
            const now = Date.now();
            setActiveToasts(prev => prev.filter(n => (now - n.timestamp) < 5000));
        }, 1000);

        return () => clearInterval(interval);
    }, [activeToasts.length]);

    const removeToast = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setActiveToasts(prev => prev.filter(n => n.id !== id));
        markRead(id); // Mark it as read when dismissed from the toast
    };

    const handleToastClick = (toast: NotificationItem) => {
        const stratMap: Record<string, string> = {
            'SUPER_ENGULFING': '/monitor/superengulfing',
            'ICT_BIAS': '/monitor/bias',
            'RSI_DIVERGENCE': '/monitor/rsi',
            'RSIDIVERGENCE': '/monitor/rsi',
            'CRT': '/monitor/crt',
            '3OB': '/monitor/3ob',
            'CISD': '/monitor/cisd',
        };
        const path = stratMap[toast.strategyType] || '/dashboard';
        navigate(`${path}?search=${toast.symbol.replace('USDT', '')}`);
        removeToast(toast.id);
    };

    return (
        <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
            <AnimatePresence>
                {activeToasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: -50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        drag="y"
                        dragConstraints={{ top: -100, bottom: 0 }}
                        dragElastic={0.2}
                        onDragEnd={(_, info) => {
                            // Dismiss if swiped up
                            if (info.offset.y < -30) {
                                removeToast(toast.id);
                            }
                        }}
                        className="pointer-events-auto w-full max-w-sm"
                    >
                        <div 
                            onClick={() => handleToastClick(toast)}
                            className="w-full bg-[#0c1010]/95 light:bg-white/95 backdrop-blur-xl border border-white/10 light:border-slate-200 shadow-2xl rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors overflow-hidden group"
                        >
                            {/* Direction Indicator */}
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                toast.direction === 'LONG' 
                                    ? 'bg-green-500/10 text-green-500' 
                                    : 'bg-red-500/10 text-red-500'
                            }`}>
                                <span className="material-symbols-outlined text-[20px]">
                                    {toast.direction === 'LONG' ? 'trending_up' : 'trending_down'}
                                </span>
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base font-bold dark:text-white light:text-slate-900 truncate">
                                        {toast.symbol.replace('USDT', '')}
                                    </span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        toast.direction === 'LONG'
                                            ? 'bg-green-500/10 text-green-500'
                                            : 'bg-red-500/10 text-red-500'
                                    }`}>
                                        {toast.direction}
                                    </span>
                                </div>
                                <p className="text-xs dark:text-gray-400 light:text-slate-500 truncate">
                                    {toast.title} • {toast.timeframe}
                                </p>
                            </div>

                            {/* Close Button / Swipe Hint */}
                            <div className="flex flex-col items-center justify-center text-gray-500 group-hover:text-white transition-colors shrink-0">
                                <button 
                                    onClick={(e) => removeToast(toast.id, e)}
                                    className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                                <div className="w-6 h-1 bg-white/10 rounded-full mt-1 lg:hidden"></div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
