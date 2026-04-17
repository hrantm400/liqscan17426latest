import { ThemeToggle } from './ThemeToggle';

import { useLocation } from 'react-router-dom';

export function Header() {
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';

  return (
    <header className="flex items-center justify-between px-8 py-6 shrink-0 z-20">
      <div className="flex flex-col gap-1">
        {isDashboard ? (
          <>
            <div className="flex items-center gap-2 text-xs font-medium text-primary/80 uppercase tracking-widest">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_#13ec37]"></span>
              System Online
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-white flex items-center gap-3 drop-shadow-lg">
              Monitor Overview
            </h1>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase">
            <span className="dark:text-gray-500 light:text-slate-500 hover:text-white cursor-pointer transition-colors">Monitor</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 hover:bg-white/10 transition-colors cursor-pointer group">
          <span className="material-symbols-outlined dark:text-gray-400 light:text-slate-500 mr-2 group-hover:text-primary text-sm">search</span>
          <input
            className="bg-transparent border-none text-sm text-white focus:ring-0 placeholder:dark:text-gray-500 light:text-slate-500 w-48 p-0"
            placeholder="Quick Search..."
            type="text"
          />
          <span className="text-[10px] font-mono dark:text-gray-600 light:text-slate-400 border border-gray-700 rounded px-1.5 py-0.5 ml-2">/</span>
        </div>
        <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center dark:text-gray-400 light:text-slate-500 hover:text-primary hover:bg-primary/10 hover:border-primary/30 transition-all">
          <span className="material-symbols-outlined text-sm">notifications</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
