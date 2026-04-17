import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useMotionValueEvent } from 'framer-motion';
import { Menu, X, Terminal, Sun, Moon } from 'lucide-react';
import { Button } from '../ui/Button';
import { AnimatedLogo } from '../shared/AnimatedLogo';
import { useAuthStore } from '../../store/authStore';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const { scrollY } = useScroll();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();

  const [isDarkMode, setIsDarkMode] = useState(true);

  // Initialize theme based on document class or default to dark
  React.useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50);
  });

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
        isScrolled ? 'bg-[#06080A]/95 backdrop-blur-xl border-[#1A1F2E] py-4 shadow-xl' : 'bg-transparent border-transparent py-6'
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0A0D14] border border-[#1A1F2E] flex items-center justify-center shadow-[0_0_15px_rgba(19,236,55,0.15)] group hover:border-primary/50 transition-colors p-1">
            <AnimatedLogo className="w-full h-full group-hover:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(19,236,55,0.6)]" />
          </div>
          <span className="font-display font-bold text-2xl tracking-tighter text-white">
            Liquidity<span className="text-gray-500">Scan</span>
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden lg:flex items-center gap-10 text-sm font-medium text-gray-400 font-mono tracking-wide">
          <a href="#features" className="hover:text-primary transition-colors">Infrastructure</a>
          <a href="#strategies" className="hover:text-primary transition-colors">Algorithms</a>
          <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
          
          <div className="flex items-center gap-6 ml-4 pl-6 border-l border-slate-200 dark:border-[#1A1F2E] transition-colors">
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme} 
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-white/5 transition-all"
              aria-label="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="flex items-center gap-2 hover:text-white transition-colors">
                  <Terminal className="w-4 h-4" /> Terminal
                </Link>
                <Link to="/profile">
                  <Button className="!px-6 !py-2 !text-sm bg-[#0A0D14] text-white border border-[#1A1F2E] hover:border-primary/50 hover:text-primary hover:shadow-[0_0_20px_rgba(19,236,55,0.2)] transition-all rounded-lg">
                    {user?.name || 'Profile'}
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-white transition-colors">Log In</Link>
                <Link to="/register">
                  <Button className="!px-6 !py-2.5 !text-sm font-bold bg-white text-black hover:bg-gray-200 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] transition-all rounded-lg">
                    Start 7-Day Trial
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 lg:hidden">
          {/* Mobile Theme Toggle */}
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-white/5 transition-all"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          {/* Mobile menu toggle */}
          <button className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="lg:hidden bg-[#0A0D14] border-b border-[#1A1F2E]"
        >
          <div className="flex flex-col p-6 gap-6 font-mono text-sm tracking-wide">
            <a href="#features" className="text-gray-400 hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>Infrastructure</a>
            <a href="#strategies" className="text-gray-400 hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>Algorithms</a>
            <a href="#pricing" className="text-gray-400 hover:text-primary transition-colors" onClick={() => setIsMobileMenuOpen(false)}>Pricing</a>
            <hr className="border-[#1A1F2E] my-2"/>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="text-gray-400 hover:text-white flex items-center gap-2 transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                  <Terminal className="w-4 h-4" /> Launch Terminal
                </Link>
                <Link to="/profile" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button className="w-full justify-center bg-[#1A1F2E] text-white border border-transparent hover:border-primary/50">{user?.name || 'Profile'}</Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-400 hover:text-white transition-colors" onClick={() => setIsMobileMenuOpen(false)}>Log In</Link>
                <Link to="/register" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button className="w-full justify-center bg-white text-black font-bold border border-transparent">Start 7-Day Trial</Button>
                </Link>
              </>
            )}
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
};
