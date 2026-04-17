import React from 'react';
import { useWatchlistStore } from '../../store/watchlistStore';

interface FavoriteStarProps {
    symbol: string;
    className?: string;
}

export const FavoriteStar: React.FC<FavoriteStarProps> = ({ symbol, className = '' }) => {
    const { isFavorite, toggleFavorite } = useWatchlistStore();
    const active = isFavorite(symbol);

    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite(symbol);
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                active 
                ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30' 
                : 'dark:bg-white/5 light:bg-gray-100 dark:text-gray-500 light:text-gray-400 hover:text-amber-500 dark:hover:bg-white/10'
            } ${className}`}
            title={active ? 'Remove from Watchlist' : 'Add to Watchlist'}
        >
            <span className={`material-symbols-outlined text-[18px] transition-transform ${active ? 'scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : ''}`} style={active ? { fontVariationSettings: "'FILL' 1" } : {}}>
                star
            </span>
        </button>
    );
};
