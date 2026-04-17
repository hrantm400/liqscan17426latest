import { useNavigate } from 'react-router-dom';

interface ProOverlayProps {
    message?: string;
}

/**
 * Reusable PRO overlay — renders a blur backdrop with lock icon and "Upgrade" CTA.
 * Wrap any content that should be blurred for FREE users inside a relative container,
 * then place this component as a sibling AFTER the content.
 *
 * Usage:
 *   <div className="relative">
 *     <SignalCard ... />   ← this gets blurred via CSS on the parent
 *     <ProOverlay />
 *   </div>
 */
export function ProOverlay({ message = 'Upgrade to PRO to unlock' }: ProOverlayProps) {
    const navigate = useNavigate();

    return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl backdrop-blur-md bg-black/40">
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 px-4 py-2 rounded-full">
                <span className="material-symbols-outlined text-primary text-lg">lock</span>
                <span className="text-primary font-bold text-xs uppercase tracking-widest">PRO</span>
            </div>
            <p className="text-sm text-gray-300 text-center max-w-[200px]">{message}</p>
            <button
                onClick={() => navigate('/subscription')}
                className="mt-1 px-6 py-2.5 bg-primary hover:bg-primary/90 text-black font-bold text-sm rounded-xl transition-all shadow-[0_4px_15px_rgba(19,236,55,0.3)]"
            >
                Upgrade Now
            </button>
        </div>
    );
}
