import { Signal } from '../../types';

/**
 * Lifecycle-aware status badge for signal rows.
 * Shows outcome with close reason, or pulsing state for live signals.
 * 
 * SE SCANNER V2: Supports new state/result_v2/result_type fields for SE signals.
 */
export function SignalStatusBadge({ signal }: { signal: Signal }) {
    const { lifecycleStatus, result, se_close_reason, pnlPercent, strategyType, state, result_v2, result_type } = signal;

    // ============================================
    // SE Scanner v2: Handle new state-based status
    // ============================================
    if (strategyType === 'SUPER_ENGULFING' && state) {
        // SE v2: LIVE state
        if (state === 'live') {
            const tp1Label = signal.tp1_hit ? '(TP1 Hit)' : '';
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 shadow-[0_0_8px_rgba(19,236,55,0.15)]">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                    </span>
                    Live {tp1Label}
                </span>
            );
        }
        
        // SE v2: CLOSED + WON
        if (state === 'closed' && result_v2 === 'won') {
            let reasonLabel = '';
            if (result_type === 'tp2_full') reasonLabel = 'TP2 Full';
            else if (result_type === 'tp1') reasonLabel = 'TP1';
            else if (result_type === 'candle_expiry') reasonLabel = 'Expiry';
            
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                    <span className="text-xs">✅</span>
                    WON {pnlPercent != null ? `+${pnlPercent.toFixed(1)}%` : ''}
                    {reasonLabel && <span className="ml-0.5 opacity-70 text-[9px]">({reasonLabel})</span>}
                </span>
            );
        }
        
        // SE v2: CLOSED + LOST
        if (state === 'closed' && result_v2 === 'lost') {
            let reasonLabel = '';
            if (result_type === 'sl') reasonLabel = 'SL';
            else if (result_type === 'candle_expiry') reasonLabel = 'Expiry';
            
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">
                    <span className="text-xs">❌</span>
                    LOST {pnlPercent != null ? `${pnlPercent.toFixed(1)}%` : ''}
                    {reasonLabel && <span className="ml-0.5 opacity-70 text-[9px]">({reasonLabel})</span>}
                </span>
            );
        }
    }

    // ============================================
    // CRT-specific: Show STRONG / WEAK / FAILED alongside WIN/LOSS
    // ============================================
    if (strategyType === 'CRT' && lifecycleStatus === 'COMPLETED') {
        const crtResult = se_close_reason as string | undefined;
        const isWin = result === 'WIN';

        return (
            <span className="inline-flex items-center gap-1.5">
                {/* Standard WIN/LOSS badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${
                    isWin
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
                        : 'bg-red-500/15 text-red-400 border-red-500/20'
                }`}>
                    <span className="text-xs">{isWin ? '✅' : '❌'}</span>
                    {isWin ? 'WIN' : 'LOSS'}
                </span>
                {/* CRT-specific STRONG/WEAK/FAILED badge */}
                {crtResult === 'STRONG' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                        <span className="material-symbols-outlined text-[11px]">bolt</span>
                        STRONG
                    </span>
                )}
                {crtResult === 'WEAK' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                        <span className="material-symbols-outlined text-[11px]">trending_flat</span>
                        WEAK
                    </span>
                )}
                {crtResult === 'FAILED' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                        <span className="material-symbols-outlined text-[11px]">close</span>
                        FAILED
                    </span>
                )}
            </span>
        );
    }

    // ============================================
    // 3OB-specific: Show WIN / FAILED result badge
    // ============================================
    if (strategyType === '3OB' && lifecycleStatus === 'COMPLETED') {
        const obResult = se_close_reason as string | undefined;
        const isWin = result === 'WIN';

        return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                isWin
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
                    : 'bg-red-500/15 text-red-400 border-red-500/20'
            }`}>
                <span className="text-xs">{isWin ? '✅' : '❌'}</span>
                {isWin ? 'WIN' : 'LOSS'}
                {obResult && <span className="ml-0.5 opacity-70 text-[9px]">({obResult})</span>}
            </span>
        );
    }

    // ============================================
    // Legacy lifecycle handling (non-SE strategies)
    // ============================================

    // COMPLETED — WIN
    if (lifecycleStatus === 'COMPLETED' && result === 'WIN') {
        const reasonLabel = se_close_reason === 'TP2' ? 'TP2' : se_close_reason === 'OPPOSITE_REV' ? 'OPP REV' : '';
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                <span className="text-xs">✅</span>
                WIN {pnlPercent != null ? `+${pnlPercent.toFixed(1)}%` : ''}
                {reasonLabel && <span className="ml-0.5 opacity-70 text-[9px]">({reasonLabel})</span>}
            </span>
        );
    }

    // COMPLETED — LOSS
    if (lifecycleStatus === 'COMPLETED' && result === 'LOSS') {
        const reasonLabel = se_close_reason === 'SL' ? 'SL' : se_close_reason === 'OPPOSITE_REV' ? 'OPP REV' : '';
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">
                <span className="text-xs">❌</span>
                LOSS {pnlPercent != null ? `${pnlPercent.toFixed(1)}%` : ''}
                {reasonLabel && <span className="ml-0.5 opacity-70 text-[9px]">({reasonLabel})</span>}
            </span>
        );
    }

    // EXPIRED
    if (lifecycleStatus === 'EXPIRED') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-500/15 dark:text-gray-400 light:text-slate-500 border border-gray-500/20">
                <span className="text-xs">⏳</span>
                EXPIRED
            </span>
        );
    }

    // PENDING
    if (lifecycleStatus === 'PENDING') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400"></span>
                </span>
                Pending
            </span>
        );
    }

    // ACTIVE (default)
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 shadow-[0_0_8px_rgba(19,236,55,0.15)]">
            <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
            </span>
            Active
        </span>
    );
}
