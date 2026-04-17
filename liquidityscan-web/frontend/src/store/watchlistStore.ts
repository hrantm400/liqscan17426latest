import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistState {
    favorites: string[];
    toggleFavorite: (symbol: string) => void;
    isFavorite: (symbol: string) => boolean;
}

export const useWatchlistStore = create<WatchlistState>()(
    persist(
        (set, get) => ({
            favorites: [],
            toggleFavorite: (symbol) => {
                const current = get().favorites;
                if (current.includes(symbol)) {
                    set({ favorites: current.filter(s => s !== symbol) });
                } else {
                    set({ favorites: [...current, symbol] });
                }
            },
            isFavorite: (symbol) => get().favorites.includes(symbol),
        }),
        {
            name: 'liquidityscan-watchlist',
        }
    )
);
