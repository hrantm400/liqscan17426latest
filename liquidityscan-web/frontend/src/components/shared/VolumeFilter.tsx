/** Volume badge shown on signal cards/rows */
export function VolumeBadge({ volume, formatVolume, isLow }: { volume: number; formatVolume: (v: number) => string; isLow: boolean }) {
    if (volume <= 0) return null;
    return (
        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${isLow
            ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
            : 'dark:bg-white/5 light:bg-gray-50 dark:text-gray-500 light:text-gray-400 dark:border-white/5 light:border-gray-200'
            }`}>
            {formatVolume(volume)}
        </span>
    );
}
