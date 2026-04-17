

interface VolumeFilterProps {
    showLowVolumes: boolean;
    onToggleLowVolumes: (show: boolean) => void;
    volumeSort: 'none' | 'high' | 'low';
    onVolumeSort: (sort: 'none' | 'high' | 'low') => void;
}

/**
 * Reusable volume filter controls:
 * - Low Volumes toggle (show/hide <$20M volume)
 * - Volume sort (High→Low, Low→High)
 */
export function VolumeFilterControls({
    showLowVolumes,
    onToggleLowVolumes,
    volumeSort,
    onVolumeSort,
}: VolumeFilterProps) {
    return (
        <>
            {/* Low Volume Toggle */}
            <button
                onClick={() => onToggleLowVolumes(!showLowVolumes)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${showLowVolumes
                    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 shadow-[0_0_8px_rgba(234,179,8,0.2)]'
                    : 'dark:bg-white/5 light:bg-gray-100 dark:text-gray-500 light:text-gray-400 dark:border-white/5 light:border-gray-200 hover:dark:text-white'
                    }`}
            >
                <span className="material-symbols-outlined text-[12px] mr-1 align-text-bottom">
                    {showLowVolumes ? 'visibility' : 'visibility_off'}
                </span>
                Low Vol
            </button>

            {/* Volume Sort */}
            <div className="flex gap-1 p-1 rounded-xl dark:bg-white/5 light:bg-gray-100 border dark:border-white/5 light:border-gray-200">
                {[
                    { key: 'none' as const, label: 'Default' },
                    { key: 'high' as const, label: 'Vol ↓' },
                    { key: 'low' as const, label: 'Vol ↑' },
                ].map(s => (
                    <button
                        key={s.key}
                        onClick={() => onVolumeSort(s.key)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${volumeSort === s.key
                            ? 'bg-amber-500 text-black'
                            : 'dark:text-gray-500 light:text-gray-400 hover:dark:text-white'
                            }`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
        </>
    );
}

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
