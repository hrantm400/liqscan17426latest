import { Link } from 'react-router-dom';
import { ThemeToggle } from '../ThemeToggle';
import { useAuthStore } from '../../store/authStore';
import { NotificationBell } from '../shared/NotificationBell';
import { AnimatedLogo } from '../shared/AnimatedLogo';

export function MobileHeader() {
    const { user } = useAuthStore();

    const getInitials = (name?: string, email?: string) => {
        if (name) {
            const parts = name.split(' ');
            if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
            return name.substring(0, 2).toUpperCase();
        }
        if (email) return email.substring(0, 2).toUpperCase();
        return 'U';
    };

    return (
        <div className="md:hidden flex items-center justify-between px-4 h-14 shrink-0 bg-[#0a140d]/80 dark:bg-[#0a140d]/80 light:bg-white/90 backdrop-blur-md border-b border-white/5 light:border-green-200 z-40 sticky top-0 pt-[env(safe-area-inset-top)]">
            <Link to="/" className="flex items-center gap-2">
                <div className="flex items-center justify-center p-0.5 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/10 to-transparent ring-1 ring-primary/30 shadow-[0_0_10px_rgba(19,236,55,0.2)] shrink-0 backdrop-blur-md">
                    <AnimatedLogo className="w-full h-full drop-shadow-[0_0_8px_rgba(19,236,55,0.8)]" />
                </div>
                <div className="flex flex-col">
                    <h1 className="text-white light:text-slate-900 text-sm font-black tracking-wider leading-none">LIQUIDITY</h1>
                    <h2 className="text-primary text-[10px] font-bold tracking-[0.2em] leading-tight">SCANNER</h2>
                </div>
            </Link>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))}
                    className="w-10 h-10 rounded-xl dark:bg-white/5 light:bg-slate-100 dark:hover:bg-white/10 light:hover:bg-slate-200 flex items-center justify-center transition-all border dark:border-white/10 light:border-slate-200"
                    title="Search / Command"
                >
                    <span className="material-symbols-outlined text-[20px] dark:text-gray-400 light:text-slate-500">search</span>
                </button>
                <NotificationBell />
                <ThemeToggle />
                <Link
                    to="/profile"
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/60 ring-1 dark:ring-white/20 light:ring-green-300 flex items-center justify-center"
                >
                    <span className="text-white text-xs font-bold">{getInitials(user?.name, user?.email)}</span>
                </Link>
            </div>
        </div>
    );
}
