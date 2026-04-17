import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function MobileBottomNav() {
    const location = useLocation();
    const { isAdmin } = useAuthStore();

    const navItems = [
        { path: '/dashboard', label: 'Home', icon: 'dashboard' },
        { path: '/monitor/superengulfing', label: 'Scanner', icon: 'candlestick_chart' },
        { path: '/strategies', label: 'Strategies', icon: 'auto_graph' },
        { path: '/courses', label: 'Academy', icon: 'school' },
    ];

    const isActive = (path: string) => {
        if (path === '/dashboard' && location.pathname === '/dashboard') return true;
        if (path !== '/dashboard' && location.pathname.startsWith(path)) return true;
        return false;
    };

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a140d]/80 dark:bg-[#0a140d]/80 light:bg-white/90 backdrop-blur-xl border-t border-white/10 light:border-green-200 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-around h-16 px-2">
                {navItems.map((item) => {
                    const active = isActive(item.path);
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${active ? 'text-primary' : 'dark:text-gray-400 light:text-slate-500'
                                }`}
                        >
                            <span className={`material-symbols-outlined transition-all duration-200 ${active ? 'text-2xl drop-shadow-[0_0_8px_rgba(19,236,55,0.5)] scale-110' : 'text-xl'
                                }`}>
                                {item.icon}
                            </span>
                            <span className={`text-[10px] font-medium tracking-wide ${active ? 'font-bold' : ''}`}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
                {/* Hamburger Menu for more options like Settings/Profile */}
                <Link
                    to="/profile"
                    className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${location.pathname.startsWith('/profile') || location.pathname.startsWith('/settings') ? 'text-primary' : 'dark:text-gray-400 light:text-slate-500'
                        }`}
                >
                    <span className={`material-symbols-outlined transition-all duration-200 ${location.pathname.startsWith('/profile') ? 'text-2xl drop-shadow-[0_0_8px_rgba(19,236,55,0.5)] scale-110' : 'text-xl'
                        }`}>
                        menu
                    </span>
                    <span className="text-[10px] font-medium tracking-wide">Menu</span>
                </Link>
            </div>
        </div>
    );
}
