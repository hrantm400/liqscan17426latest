import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NotificationItem {
    id: string;
    title: string;
    message: string;
    symbol: string;
    strategyType: string;
    timeframe: string;
    direction: string;
    timestamp: number;
    read: boolean;
}

interface NotificationState {
    soundEnabled: boolean;
    /** Top floating toast cards on new signals (in-app, not OS/browser) */
    toastPopupsEnabled: boolean;
    pushEnabled: boolean;
    notifications: NotificationItem[];
    unreadCount: number;
    setSoundEnabled: (enabled: boolean) => void;
    setToastPopupsEnabled: (enabled: boolean) => void;
    setPushEnabled: (enabled: boolean) => void;
    addNotification: (notif: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
    markAllRead: () => void;
    markRead: (id: string) => void;
    clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
            soundEnabled: true,
            toastPopupsEnabled: true,
            pushEnabled: false,
            notifications: [],
            unreadCount: 0,
            setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
            setToastPopupsEnabled: (enabled) => set({ toastPopupsEnabled: enabled }),
            setPushEnabled: (enabled) => set({ pushEnabled: enabled }),
            addNotification: (notif) => {
                const newNotif: NotificationItem = {
                    ...notif,
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    timestamp: Date.now(),
                    read: false,
                };
                const current = get().notifications;
                // Keep last 50 notifications max
                const updated = [newNotif, ...current].slice(0, 50);
                set({
                    notifications: updated,
                    unreadCount: updated.filter(n => !n.read).length,
                });
            },
            markAllRead: () => {
                set(state => ({
                    notifications: state.notifications.map(n => ({ ...n, read: true })),
                    unreadCount: 0,
                }));
            },
            markRead: (id) => {
                set(state => {
                    const updated = state.notifications.map(n => n.id === id ? { ...n, read: true } : n);
                    return {
                        notifications: updated,
                        unreadCount: updated.filter(n => !n.read).length,
                    };
                });
            },
            clearAll: () => set({ notifications: [], unreadCount: 0 }),
        }),
        {
            name: 'liquidityscan-notifications',
            merge: (persisted, current) => ({
                ...current,
                ...(persisted as object),
                toastPopupsEnabled:
                    (persisted as Partial<NotificationState>).toastPopupsEnabled ?? true,
            }),
        }
    )
);
