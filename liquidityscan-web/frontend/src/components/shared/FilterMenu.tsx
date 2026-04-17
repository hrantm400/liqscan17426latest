import React from 'react';

export type SortByOption = 'time' | 'symbol';

interface FilterMenuProps {
  isOpen: boolean;
  sortBy: SortByOption;
  onSortChange: (sort: SortByOption) => void;
  marketCapSort: 'high-low' | 'low-high' | null;
  onMarketCapSortChange: (sort: 'high-low' | 'low-high' | null) => void;
  volumeSort: 'high-low' | 'low-high' | null;
  onVolumeSortChange: (sort: 'high-low' | 'low-high' | null) => void;
  rankingFilter: number | null;
  onRankingFilterChange: (rank: number | null) => void;
  onReset: () => void;
  align?: 'left' | 'right';
}

export const FilterMenu: React.FC<FilterMenuProps> = ({
  isOpen,
  sortBy,
  onSortChange,
  marketCapSort,
  onMarketCapSortChange,
  volumeSort,
  onVolumeSortChange,
  rankingFilter,
  onRankingFilterChange,
  onReset,
  align = 'right',
}) => {
  if (!isOpen) return null;

  return (
    <div className={`absolute top-full mt-2 w-72 dark:bg-[#112214] dark:backdrop-blur-md light:bg-white dark:border-[#234829] light:border-green-300 rounded-xl dark:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.6)] light:shadow-lg z-50 p-2 flex flex-col gap-1 dark:ring-1 dark:ring-white/5 light:ring-1 light:ring-green-300 border ${align === 'right' ? 'right-0' : 'left-0'}`}>
      <div className="px-2 py-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold dark:text-gray-500 light:text-text-light-secondary tracking-widest">Sort By</span>
      </div>
      <button
        type="button"
        onClick={() => onSortChange('time')}
        className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-xs font-medium transition-all w-full ${sortBy === 'time'
          ? 'dark:bg-primary/10 light:bg-green-100 border-primary/30 dark:text-white light:text-text-dark'
          : 'border-transparent dark:hover:bg-primary/10 light:hover:bg-green-100 hover:border-primary/30 dark:text-gray-300 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
          }`}
      >
        <div className="flex items-center gap-2.5">
          <span className={`material-symbols-outlined text-sm ${sortBy === 'time' ? 'text-primary' : 'dark:text-gray-400 light:text-text-light-secondary'}`}>
            schedule
          </span>
          Time Detected
        </div>
        {sortBy === 'time' && (
          <span className="material-symbols-outlined text-base text-primary drop-shadow-[0_0_5px_rgba(19,236,55,0.5)]">check</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onSortChange('symbol')}
        className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-xs font-medium transition-all w-full ${sortBy === 'symbol'
          ? 'dark:bg-primary/10 light:bg-green-100 border-primary/30 dark:text-white light:text-text-dark'
          : 'border-transparent dark:hover:bg-primary/10 light:hover:bg-green-100 hover:border-primary/30 dark:text-gray-300 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
          }`}
      >
        <div className="flex items-center gap-2.5">
          <span className={`material-symbols-outlined text-sm ${sortBy === 'symbol' ? 'text-primary' : 'dark:text-gray-400 light:text-text-light-secondary'}`}>
            sort_by_alpha
          </span>
          Ticker Symbol
        </div>
        {sortBy === 'symbol' && (
          <span className="material-symbols-outlined text-base text-primary drop-shadow-[0_0_5px_rgba(19,236,55,0.5)]">check</span>
        )}
      </button>

      <div className="h-px dark:bg-[#234829] light:bg-green-200/30 my-1 mx-1"></div>

      <div className="px-2 py-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold dark:text-gray-500 light:text-text-light-secondary tracking-widest">By CMC Rank</span>
      </div>
      <div className="grid grid-cols-2 gap-1 px-1 mb-1">
        <button
          type="button"
          onClick={() => onMarketCapSortChange(marketCapSort === 'high-low' ? null : 'high-low')}
          className={`flex items-center justify-center gap-2 px-2 py-2 rounded-lg border text-xs font-medium transition-all w-full ${marketCapSort === 'high-low'
            ? 'dark:bg-primary/10 light:bg-green-100 border-primary/30 dark:text-white light:text-text-dark'
            : 'border-transparent dark:hover:bg-primary/10 light:hover:bg-green-100 hover:border-primary/30 dark:text-gray-300 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
            }`}
        >
          <span className="material-symbols-outlined text-sm">arrow_upward</span>
          Rank 1-N (High Cap)
        </button>
        <button
          type="button"
          onClick={() => onMarketCapSortChange(marketCapSort === 'low-high' ? null : 'low-high')}
          className={`flex items-center justify-center gap-2 px-2 py-2 rounded-lg border text-xs font-medium transition-all w-full ${marketCapSort === 'low-high'
            ? 'dark:bg-primary/10 light:bg-green-100 border-primary/30 dark:text-white light:text-text-dark'
            : 'border-transparent dark:hover:bg-primary/10 light:hover:bg-green-100 hover:border-primary/30 dark:text-gray-300 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
            }`}
        >
          <span className="material-symbols-outlined text-sm">arrow_downward</span>
          Rank N-1 (Low Cap)
        </button>
      </div>

      <div className="h-px dark:bg-[#234829] light:bg-green-200/30 my-1 mx-1"></div>

      <div className="px-2 py-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold dark:text-gray-500 light:text-text-light-secondary tracking-widest">By 24H Volume</span>
      </div>
      <div className="grid grid-cols-2 gap-1 px-1 mb-1">
        <button
          type="button"
          onClick={() => onVolumeSortChange(volumeSort === 'high-low' ? null : 'high-low')}
          className={`flex items-center justify-center gap-2 px-2 py-2 rounded-lg border text-xs font-medium transition-all w-full ${volumeSort === 'high-low'
            ? 'dark:bg-primary/10 light:bg-green-100 border-primary/30 dark:text-white light:text-text-dark'
            : 'border-transparent dark:hover:bg-primary/10 light:hover:bg-green-100 hover:border-primary/30 dark:text-gray-300 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
            }`}
        >
          <span className="material-symbols-outlined text-sm">arrow_downward</span>
          High to Low
        </button>
        <button
          type="button"
          onClick={() => onVolumeSortChange(volumeSort === 'low-high' ? null : 'low-high')}
          className={`flex items-center justify-center gap-2 px-2 py-2 rounded-lg border text-xs font-medium transition-all w-full ${volumeSort === 'low-high'
            ? 'dark:bg-primary/10 light:bg-green-100 border-primary/30 dark:text-white light:text-text-dark'
            : 'border-transparent dark:hover:bg-primary/10 light:hover:bg-green-100 hover:border-primary/30 dark:text-gray-300 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
            }`}
        >
          <span className="material-symbols-outlined text-sm">arrow_upward</span>
          Low to High
        </button>
      </div>

      <div className="h-px dark:bg-[#234829] light:bg-green-300 my-1 mx-1"></div>

      <div className="px-2 py-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold dark:text-gray-500 light:text-text-light-secondary tracking-widest">By Rankings</span>
      </div>
      <div className="grid grid-cols-2 gap-1 px-1">
        {[10, 30, 50, 100].map((rank) => (
          <button
            type="button"
            key={rank}
            onClick={() => onRankingFilterChange(rankingFilter === rank ? null : rank)}
            className={`flex items-center justify-center px-2 py-2 rounded-lg border text-xs font-medium transition-all w-full ${rankingFilter === rank
              ? 'dark:bg-primary/10 light:bg-green-100 border-primary/30 dark:text-white light:text-text-dark'
              : 'border-transparent dark:hover:bg-primary/10 light:hover:bg-green-100 hover:border-primary/30 dark:text-gray-300 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark'
              }`}
          >
            Top {rank}
          </button>
        ))}
      </div>

      <div className="h-px dark:bg-[#234829] light:bg-green-300 my-1 mx-1"></div>

      <button
        type="button"
        onClick={onReset}
        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-transparent dark:hover:bg-white/5 light:hover:bg-green-100 dark:hover:border-white/10 light:hover:border-green-300 text-xs font-medium dark:text-gray-400 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark transition-all w-full mt-1"
      >
        <span className="material-symbols-outlined text-sm">restart_alt</span>
        Reset Filters
      </button>
    </div>
  );
};
