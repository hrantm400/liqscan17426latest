import { Link, useLocation } from 'react-router-dom';
import { AnimatedLogo } from './shared/AnimatedLogo';

export function Sidebar() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/top-coins', label: 'Top 50', icon: 'leaderboard' },
    { path: '/monitor/superengulfing', label: 'SuperEngulfing', icon: 'candlestick_chart' },
    { path: '/monitor/bias', label: 'Bias Shifts', icon: 'timeline' },
    { path: '/monitor/rsi', label: 'RSI Divergence', icon: 'hub' },
    { path: '/risk-calculator', label: 'Risk Calculator', icon: 'calculate' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <aside className="relative z-20 hidden md:flex w-72 flex-col justify-between glass-sidebar h-full shrink-0 transition-all duration-300 opacity-40 hover:opacity-100">
      <div className="flex flex-col">
        <div className="p-8 pb-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center p-1 w-10 h-10 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30 shadow-[0_0_15px_rgba(19,236,55,0.2)]">
              <AnimatedLogo className="w-full h-full" />
            </div>
            <div>
              <h1 className="text-white text-lg font-black tracking-wider leading-none">LIQUIDITY</h1>
              <h2 className="text-primary text-xs font-bold tracking-[0.2em] leading-tight">SCANNER</h2>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-8 pr-4 overflow-y-auto custom-scrollbar max-h-[calc(100vh-200px)]">
          <div className="flex flex-col gap-1">
            <p className="px-6 text-[10px] font-bold tracking-widest dark:text-gray-400 light:text-slate-600 uppercase mb-2">Market Data</p>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`group flex items-center gap-4 px-6 py-3 border-l-[3px] rounded-r-lg transition-all ${isActive(item.path)
                  ? 'bg-[#13ec37]/10 border-l-[#13ec37] text-white'
                  : 'border-l-transparent dark:text-gray-400 light:text-slate-600 hover:text-white hover:bg-white/5'
                  }`}
              >
                <span className={`material-symbols-outlined ${!isActive(item.path) ? 'group-hover:text-primary transition-colors' : ''}`}>
                  {item.icon}
                </span>
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
