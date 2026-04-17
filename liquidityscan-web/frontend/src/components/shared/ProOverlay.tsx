import { useNavigate } from 'react-router-dom';

interface ProOverlayProps {
    children: React.ReactNode;
    isLocked: boolean;
    label?: string;
}

/**
 * Wraps content with a blur overlay + PRO badge + Upgrade button for free users.
 * When isLocked=true, content is blurred and a PRO upgrade prompt is shown.
 */
export function ProOverlay({ children, isLocked, label = 'PRO' }: ProOverlayProps) {
    const navigate = useNavigate();

    if (!isLocked) return <>{children}</>;

    return (
        <div className="relative group">
            {/* Blurred Content */}
            <div className="blur-[6px] pointer-events-none select-none opacity-60 transition-all duration-300">
                {children}
            </div>

            {/* Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/20 dark:bg-black/40 rounded-xl backdrop-blur-[2px]">
                {/* PRO Badge */}
                <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-primary/80 to-primary text-black text-[10px] font-black uppercase tracking-[0.25em] mb-3 shadow-[0_0_20px_rgba(19,236,55,0.3)]">
                    🔒 {label}
                </div>
                <p className="text-sm dark:text-gray-300 light:text-gray-600 font-medium mb-3 text-center px-4">
                    Upgrade to unlock this feature
                </p>
                <button
                    onClick={() => navigate('/subscriptions')}
                    className="px-6 py-2.5 rounded-xl bg-primary text-black font-bold text-xs transition-all hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(19,236,55,0.3)] flex items-center gap-1.5"
                >
                    <span className="material-symbols-outlined text-sm">bolt</span>
                    Upgrade Now
                </button>
            </div>
        </div>
    );
}
