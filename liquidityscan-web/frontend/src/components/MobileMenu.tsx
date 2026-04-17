import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/monitor/superengulfing', label: 'SuperEngulfing', icon: 'candlestick_chart' },
    { path: '/monitor/bias', label: 'Bias Shifts', icon: 'timeline' },
    { path: '/monitor/rsi', label: 'RSI Divergence', icon: 'hub' },
    { path: '/custom-alerts', label: 'Custom Alerts', icon: 'notifications_active' },
  ];

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10"
        aria-label="Toggle menu"
      >
        <span className="material-symbols-outlined text-white">menu</span>
      </button>
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-background-dark/95 backdrop-blur-md">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">waves</span>
                <div>
                  <h1 className="text-white text-lg font-black">LIQUIDITY</h1>
                  <h2 className="text-primary text-xs font-bold">SCANNER</h2>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2">
                <span className="material-symbols-outlined text-white">close</span>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 ${location.pathname === item.path
                    ? 'bg-primary/10 border-l-4 border-l-primary text-white'
                    : 'dark:text-gray-400 light:text-slate-500 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
