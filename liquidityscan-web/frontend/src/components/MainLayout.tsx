import React, { useEffect, useState, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { useAuthStore } from '../store/authStore';
import { userApi, authApi } from '../services/userApi';
import { useQuery } from '@tanstack/react-query';
import { SubscriptionBadge } from './subscriptions/SubscriptionBadge';
import { ProLabelPill } from './subscriptions/ProLabelPill';
import { MobileHeader } from './layout/MobileHeader';
import { MobileBottomNav } from './layout/MobileBottomNav';
import { NeonLoader } from './shared/NeonLoader';
import { TimezoneGate } from './onboarding/TimezoneGate';
import { GlobalNotificationPoller } from './shared/GlobalNotificationPoller';
import { GlobalToastManager } from './shared/GlobalToastManager';
import { FloatingChartManager } from './shared/FloatingChartManager';
import { AnimatedLogo } from './shared/AnimatedLogo';

const MainLayout: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, setUser, token, isAdmin } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const hasFetchedRef = useRef(false);

    // Fetch user profile if we have a token but no user data, and protect routes
    useEffect(() => {
        const fetchProfile = async () => {
            // Don't redirect if already on login page
            if (location.pathname === '/login' || location.pathname === '/register') {
                setLoading(false);
                return;
            }

            // MainLayout is only used for protected routes, so if no token, redirect to login
            if (!token) {
                // Only redirect if not already on login/register
                if (location.pathname !== '/login' && location.pathname !== '/register') {
                    navigate('/login', { replace: true });
                }
                setLoading(false);
                return;
            }

            // Always fetch profile to get latest isAdmin status (but only once per mount)
            if (!hasFetchedRef.current) {
                hasFetchedRef.current = true;
                try {
                    const profile = await authApi.getProfile();
                    setUser(profile);
                } catch (error: any) {
                    // If profile fetch fails (401/403), clear token and redirect to login
                    if (
                        error?.name === 'AuthExpiredError' ||
                        error?.message?.includes('Session expired') ||
                        error?.message?.includes('401') ||
                        error?.message?.includes('403') ||
                        error?.message?.includes('Unauthorized')
                    ) {
                        console.error('Failed to fetch profile - unauthorized:', error);
                        useAuthStore.getState().logout();
                        if (location.pathname !== '/login') {
                            navigate('/login', { replace: true });
                        }
                    } else {
                        // For other errors, just log but don't redirect (might be network issue)
                        console.error('Failed to fetch profile:', error);
                    }
                }
            }
            setLoading(false);
        };

        fetchProfile();
    }, [token, location.pathname, navigate, setUser]); // Added location.pathname to dependencies

    const isActive = (path: string): boolean => {
        const currentPath = location.pathname || '/';
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        return currentPath === normalizedPath || currentPath.startsWith(normalizedPath + '/');
    };

    // Reusable sidebar link classes
    const linkCls = (path: string) => {
        const active = isActive(path);
        return {
            link: `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group/link border ${active
                ? 'bg-gradient-to-r from-primary/15 to-transparent border-primary/30 dark:text-white light:text-slate-900 shadow-[0_0_12px_rgba(19,236,55,0.08)]'
                : 'border-transparent dark:text-gray-400 light:text-slate-500 dark:hover:bg-white/5 light:hover:bg-green-50/50 dark:hover:text-white light:hover:text-slate-900'
            }`,
            icon: `material-symbols-outlined text-[20px] transition-all shrink-0 ${active ? 'text-primary drop-shadow-[0_0_6px_rgba(19,236,55,0.5)]' : 'dark:text-gray-500 light:text-slate-400 group-hover/link:text-primary'}`,
            label: `text-sm font-semibold transition-opacity duration-300 whitespace-nowrap tracking-wide ${isPinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'}`,
        };
    };

    const watchlistCls = (path: string) => {
        const active = isActive(path);
        return {
            link: `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group/link border ${active
                ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/30 text-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
                : 'border-transparent dark:text-gray-400 light:text-slate-500 dark:hover:bg-white/5 light:hover:bg-green-50/50 hover:text-amber-500'
            }`,
            icon: `material-symbols-outlined text-[20px] transition-all shrink-0 ${active ? 'text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]' : 'dark:text-gray-500 light:text-slate-400 group-hover/link:text-amber-500'}`,
            label: `text-sm font-semibold transition-opacity duration-300 whitespace-nowrap tracking-wide ${isPinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'}`,
        };
    };

    const getInitials = (name?: string, email?: string) => {
        if (name) {
            const parts = name.split(' ');
            if (parts.length >= 2) {
                return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
            }
            return name.substring(0, 2).toUpperCase();
        }
        if (email) {
            return email.substring(0, 2).toUpperCase();
        }
        return 'U';
    };

    const displayName = user?.name || user?.email?.split('@')[0] || 'User';

    // Fetch user subscription
    const { data: mySubscription } = useQuery({
        queryKey: ['mySubscription'],
        queryFn: () => userApi.getMySubscription(),
        enabled: !!token,
    });

    // Timezone Logic
    const hasTimezone = !!user?.timezone;
    const LEGACY_DATE = new Date('2024-03-31T00:00:00Z'); // Arbitrary legacy cutoff date
    const isLegacyUser = user?.createdAt ? new Date(user.createdAt) < LEGACY_DATE : false;

    // Gate opens for non-legacy users without a timezone
    const [isTimezoneGateOpen, setTimezoneGateOpen] = useState(!hasTimezone && !isLegacyUser && !loading);
    
    // Updates when profile loads
    useEffect(() => {
        if (!loading && user) {
             const userMissingTz = !user.timezone;
             const isLegacy = new Date(user.createdAt) < LEGACY_DATE;
             setTimezoneGateOpen(userMissingTz && !isLegacy);
        }
    }, [loading, user]);

    // Legacy users see banner instead of gate
    const showLegacyBanner = !hasTimezone && isLegacyUser && !loading;

    // Sidebar Pin Logic
    const [isPinned, setIsPinned] = useState(() => {
        const saved = localStorage.getItem('liquidityscan_sidebar_pinned');
        return saved === 'true';
    });

    // Save pin state to local storage when toggled
    const togglePin = () => {
        setIsPinned(!isPinned);
        localStorage.setItem('liquidityscan_sidebar_pinned', String(!isPinned));
    };

    return (
        <div className="flex flex-col md:flex-row h-[100dvh] w-full selection:bg-primary selection:text-black overflow-hidden font-sans dark:bg-background-dark dark:text-white light:bg-background-light light:text-text-dark pb-16 md:pb-0 relative">
            <GlobalNotificationPoller />
            <GlobalToastManager />
            <FloatingChartManager />
            
            {/* Timezone Gate for New Users */}
            <TimezoneGate isOpen={isTimezoneGateOpen} onComplete={() => setTimezoneGateOpen(false)} />

            {/* Premium Background Effects */}
            <div className="fixed inset-0 pointer-events-none z-0 bg-grid-pattern bg-[length:24px_24px] dark:opacity-50 light:opacity-30"></div>
            <div className="fixed top-[-20%] left-[-10%] w-[800px] h-[800px] bg-primary/10 rounded-full blur-[150px] pointer-events-none z-0"></div>

            {/* Mobile Header (Hidden on Desktop) */}
            <MobileHeader />

            {/* Top Legacy Banner */}
            {showLegacyBanner && (
               <div className="absolute top-0 left-0 right-0 z-[60] py-2 px-4 bg-yellow-500/20 border-b border-yellow-500/50 flex items-center justify-between backdrop-blur-md md:left-[80px]">
                   <span className="text-yellow-200 text-xs md:text-sm font-medium">
                       ⚠️ LiquidityScanner now supports local timezones. Your signals are currently defaulting to UTC.
                   </span>
                   <button onClick={() => navigate('/settings')} className="ml-4 px-3 py-1 bg-yellow-500/30 hover:bg-yellow-500/40 text-yellow-100 rounded text-xs font-bold transition-colors whitespace-nowrap">
                       Update Settings
                   </button>
               </div>
            )}

            {/* Premium Sidebar */}
            <aside 
                className={`relative z-20 hidden md:flex flex-col shrink-0 transition-all duration-400 ease-in-out group/sidebar overflow-hidden pb-16 md:pb-0
                dark:bg-background-dark/80 light:bg-white/90 backdrop-blur-xl border-r dark:border-white/5 light:border-primary/20 shadow-[4px_0_24px_rgba(0,0,0,0.2)]
                ${isPinned ? 'w-full md:w-[280px]' : 'w-full md:w-[80px] hover:w-[280px]'}`}
            >
                {/* Sidebar Header / Logo */}
                <div className="flex shrink-0 p-6 pb-8 items-center justify-between">
                    <div className="flex items-center gap-4 w-[200px]">
                        <div className="flex shrink-0 items-center justify-center p-1 w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-transparent ring-1 ring-primary/30 shadow-[0_0_15px_rgba(19,236,55,0.2)] backdrop-blur-md">
                            <AnimatedLogo className="w-full h-full drop-shadow-[0_0_8px_rgba(19,236,55,0.8)]" />
                        </div>
                        <div className={`flex flex-col transition-opacity duration-300 overflow-hidden whitespace-nowrap ${isPinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'}`}>
                            <h1 className="text-white text-lg font-black tracking-wider leading-none drop-shadow-md">LIQUIDITY</h1>
                            <h2 className="text-primary text-[10px] font-bold tracking-[0.25em] leading-tight opacity-90">SCANNER</h2>
                        </div>
                    </div>
                    
                    {/* Pin Button */}
                    <button 
                        onClick={togglePin}
                        className={`hidden md:flex items-center justify-center w-8 h-8 rounded-lg transition-all 
                        ${isPinned 
                            ? 'opacity-100 text-primary bg-primary/10 ring-1 ring-primary/30 shadow-[0_0_10px_rgba(19,236,55,0.2)]' 
                            : 'opacity-0 group-hover/sidebar:opacity-100 text-gray-500 hover:text-white hover:bg-white/5'}`}
                        title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
                    >
                        <span className={`material-symbols-outlined text-lg ${isPinned ? 'fill-icon' : ''}`} style={isPinned ? { fontVariationSettings: "'FILL' 1" } : {}}>push_pin</span>
                    </button>
                </div>

                {/* Global Search Hint */}
                <div className={`px-4 mb-4 transition-all duration-300 ${isPinned || 'opacity-0 group-hover/sidebar:opacity-100 hidden group-hover/sidebar:block'}`}>
                    <button
                        onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all group/search
                          dark:bg-black/20 dark:hover:bg-black/40 dark:border-white/5
                          light:bg-slate-100 light:hover:bg-slate-200 light:border-slate-200
                          border hover:border-primary/30"
                    >
                        <div className="flex items-center gap-2 dark:text-gray-400 light:text-slate-500 dark:group-hover/search:text-white light:group-hover/search:text-slate-900 transition-colors">
                            <span className="material-symbols-outlined text-[18px]">search</span>
                            <span className="text-xs font-medium">Search / Command...</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded-md text-[9px] font-mono transition-colors
                              dark:bg-white/5 dark:border-white/10 dark:text-gray-500
                              light:bg-white light:border-slate-200 light:text-slate-400
                              border group-hover/search:text-primary">/</kbd>
                        </div>
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3">
                    <div className="flex flex-col gap-4 pb-4">
                        {/* CORE-LAYER
                            Static group — no collapse state. If collapsibility is wanted later,
                            every existing section needs the same pattern for consistency. */}
                        <div className="flex flex-col gap-1">
                            <div className={`flex items-center justify-between px-3 mb-1 transition-opacity duration-300 whitespace-nowrap ${isPinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'}`}>
                                <p className="text-[10px] font-bold tracking-[0.15em] dark:text-gray-500 light:text-slate-400 uppercase">Core-Layer</p>
                                <ProLabelPill />
                            </div>
                            <Link to="/core-layer/se" className={linkCls('/core-layer/se').link}><span className={linkCls('/core-layer/se').icon}>grain</span><span className={linkCls('/core-layer/se').label}>SE</span></Link>
                            <Link to="/core-layer/crt" className={linkCls('/core-layer/crt').link}><span className={linkCls('/core-layer/crt').icon}>radar</span><span className={linkCls('/core-layer/crt').label}>CRT</span></Link>
                            <Link to="/core-layer/bias" className={linkCls('/core-layer/bias').link}><span className={linkCls('/core-layer/bias').icon}>stacked_line_chart</span><span className={linkCls('/core-layer/bias').label}>Bias</span></Link>
                        </div>

                        {/* MARKETS */}
                        <div className="flex flex-col gap-1">
                            <p className={`px-3 text-[10px] font-bold tracking-[0.15em] dark:text-gray-500 light:text-slate-400 uppercase mb-1 transition-opacity duration-300 whitespace-nowrap ${isPinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'}`}>MARKETS</p>
                            <Link to="/dashboard" className={linkCls('/dashboard').link}><span className={linkCls('/dashboard').icon}>dashboard</span><span className={linkCls('/dashboard').label}>Dashboard</span></Link>
                            <Link to="/watchlist" className={watchlistCls('/watchlist').link}><span className={watchlistCls('/watchlist').icon}>star</span><span className={watchlistCls('/watchlist').label}>Watchlist</span></Link>
                            <Link to="/top-coins" className={linkCls('/top-coins').link}><span className={linkCls('/top-coins').icon}>leaderboard</span><span className={linkCls('/top-coins').label}>Top 50</span></Link>
                            <Link to="/monitor/superengulfing" className={linkCls('/monitor/superengulfing').link}><span className={linkCls('/monitor/superengulfing').icon}>candlestick_chart</span><span className={linkCls('/monitor/superengulfing').label}>SuperEngulfing</span></Link>
                            <Link to="/monitor/bias" className={linkCls('/monitor/bias').link}><span className={linkCls('/monitor/bias').icon}>timeline</span><span className={linkCls('/monitor/bias').label}>Bias</span></Link>
                            <Link to="/monitor/rsi" className={linkCls('/monitor/rsi').link}><span className={linkCls('/monitor/rsi').icon}>hub</span><span className={linkCls('/monitor/rsi').label}>RSI Divergence</span></Link>
                            <Link to="/monitor/crt" className={linkCls('/monitor/crt').link}><span className={linkCls('/monitor/crt').icon}>target</span><span className={linkCls('/monitor/crt').label}>CRT</span></Link>
                            <Link to="/monitor/3ob" className={linkCls('/monitor/3ob').link}><span className={linkCls('/monitor/3ob').icon}>layers</span><span className={linkCls('/monitor/3ob').label}>3-OB</span></Link>
                            <Link to="/monitor/cisd" className={linkCls('/monitor/cisd').link}><span className={linkCls('/monitor/cisd').icon}>change_circle</span><span className={linkCls('/monitor/cisd').label}>CISD</span></Link>
                        </div>

                        {/* STRATEGIES */}
                        <div className="flex flex-col gap-1 pt-2 border-t dark:border-white/5 light:border-primary/10">
                            <Link to="/strategies" className={linkCls('/strategies').link}><span className={linkCls('/strategies').icon}>architecture</span><span className={linkCls('/strategies').label}>Strategies</span></Link>
                            <Link to="/tools" className={linkCls('/tools').link}><span className={linkCls('/tools').icon}>handyman</span><span className={linkCls('/tools').label}>Tools</span></Link>
                        </div>

                        {/* ACADEMY */}
                        <div className="flex flex-col gap-1 pt-2 border-t dark:border-white/5 light:border-primary/10">
                            <Link to="/courses" className={linkCls('/courses').link}><span className={linkCls('/courses').icon}>school</span><span className={linkCls('/courses').label}>Academy</span></Link>
                        </div>

                        {/* ADMIN PANEL */}
                        {(isAdmin || user?.isAdmin) && (
                            <div className="flex flex-col gap-1 pt-2 border-t dark:border-white/5 light:border-primary/10">
                                <Link to="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group/link bg-gradient-to-r from-red-500/10 to-transparent border border-red-500/20 hover:border-red-500/40">
                                    <span className="material-symbols-outlined text-[20px] text-red-500 shrink-0 group-hover/link:scale-110 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">admin_panel_settings</span>
                                    <span className={`text-sm font-bold text-red-400 transition-opacity duration-300 whitespace-nowrap tracking-wide ${isPinned ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100'}`}>Admin Panel</span>
                                </Link>
                            </div>
                        )}

                        {/* OTHER */}
                        <div className="flex flex-col gap-1 pt-2 border-t dark:border-white/5 light:border-primary/10">
                            <Link to="/daily-recap" className={linkCls('/daily-recap').link}><span className={linkCls('/daily-recap').icon}>summarize</span><span className={linkCls('/daily-recap').label}>Daily Recap</span></Link>
                            <Link to="/settings" className={linkCls('/settings').link}><span className={linkCls('/settings').icon}>settings</span><span className={linkCls('/settings').label}>Settings</span></Link>
                            <Link to="/subscription" className={linkCls('/subscription').link}><span className={linkCls('/subscription').icon}>card_membership</span><span className={linkCls('/subscription').label}>Subscription</span></Link>
                            <Link to="/support" className={linkCls('/support').link}><span className={linkCls('/support').icon}>help_center</span><span className={linkCls('/support').label}>Support</span></Link>
                        </div>
                    </div>
                </div>

                {/* Bottom section */}
                <div className="shrink-0 p-4 pt-3 border-t dark:border-white/5 light:border-primary/20 space-y-3 dark:bg-black/40 light:bg-white/80 backdrop-blur-3xl">
                    <ThemeToggle isPinned={isPinned} />
                    
                    <Link
                        to="/profile"
                        className={`flex items-center rounded-2xl dark:bg-white/5 dark:hover:bg-white/10 light:bg-primary/5 light:hover:bg-primary/10 cursor-pointer transition-all duration-300 group/profile border dark:border-white/10 light:border-primary/20 hover:shadow-lg hover:-translate-y-1
                            ${isPinned ? 'p-3 gap-3' : 'p-1.5 justify-center w-11 h-11 mx-auto'}
                        `}
                    >
                        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-primary/40 to-primary/80 ring-2 dark:ring-white/10 light:ring-primary/50 group-hover/profile:ring-primary transition-all flex items-center justify-center shadow-md">
                            <span className="text-white text-xs font-black drop-shadow-md">
                                {loading ? '...' : getInitials(user?.name, user?.email)}
                            </span>
                        </div>
                        <div className={`flex flex-col flex-1 whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out
                            ${isPinned ? 'w-auto opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-4 absolute pointer-events-none group-hover/sidebar:relative group-hover/sidebar:w-auto group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-4 group-hover/sidebar:pl-1'}
                        `}>
                            <span className="text-sm font-bold dark:text-white light:text-slate-900 group-hover/profile:text-primary transition-colors truncate">
                                {loading ? 'Loading...' : displayName}
                            </span>
                            <div className="mt-0.5">
                                {loading ? (
                                    <span className="text-[10px] dark:text-gray-400 font-medium">...</span>
                                ) : (
                                    <SubscriptionBadge
                                        subscription={mySubscription?.subscription}
                                        status={mySubscription?.subscriptionStatus}
                                    />
                                )}
                            </div>
                        </div>
                        <span className={`material-symbols-outlined dark:text-gray-400 light:text-slate-400 text-lg ml-auto dark:group-hover/profile:text-white light:group-hover/profile:text-primary transition-all shrink-0
                            ${isPinned ? 'opacity-100' : 'opacity-0 hidden group-hover/sidebar:block group-hover/sidebar:opacity-100'}
                        `}>chevron_right</span>
                    </Link>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="relative z-10 flex flex-col flex-1 h-full overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="flex flex-col items-center gap-4">
                            <NeonLoader />
                            <div className="dark:text-white light:text-text-dark text-lg font-mono px-4">Loading...</div>
                        </div>
                    </div>
                ) : (
                    <Outlet />
                )}
            </main>

            {/* Mobile Bottom Navigation (Hidden on Desktop) */}
            <MobileBottomNav />
        </div>
    );
};

export default MainLayout;
