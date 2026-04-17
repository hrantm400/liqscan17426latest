import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  isPinned?: boolean;
}

export function ThemeToggle({ isPinned = true }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={`relative flex items-center p-2.5 rounded-2xl transition-all duration-500 ease-in-out group/theme cursor-pointer
        border sm:border-transparent md:border hover:shadow-lg hover:-translate-y-1
        ${isDark 
          ? 'bg-white/5 hover:bg-white/10 border-white/10 dark:md:border-white/10' 
          : 'bg-primary/5 hover:bg-primary/10 border-primary/20 light:md:border-primary/20'}
        ${isPinned ? 'w-full justify-start gap-4' : 'w-11 h-11 justify-center mx-auto'}
      `}
      aria-label="Toggle theme"
    >
      <div className={`relative flex items-center justify-center shrink-0 rounded-full transition-all duration-500 ease-in-out
          ${isPinned ? 'w-8 h-8' : 'w-full h-full'}
          ${!isDark ? 'bg-amber-100/50 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'bg-blue-900/30 shadow-[0_0_15px_rgba(59,130,246,0.3)]'}
      `}>
          {/* SVG Container with rotation */}
          <div className={`relative w-5 h-5 transition-transform duration-700 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)]
                ${isDark ? 'rotate-[-360deg]' : 'rotate-0'}
          `}>
              {/* Sun (Light Mode) */}
              <svg 
                  className={`absolute inset-0 w-full h-full text-amber-500 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)] transition-all duration-500
                    ${isDark ? 'opacity-0 scale-50 -rotate-90' : 'opacity-100 scale-100 rotate-0'}
                  `}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M12 2v2"></path>
                  <path d="M12 20v2"></path>
                  <path d="M4.93 4.93l1.41 1.41"></path>
                  <path d="M17.66 17.66l1.41 1.41"></path>
                  <path d="M2 12h2"></path>
                  <path d="M20 12h2"></path>
                  <path d="M4.93 19.07l1.41-1.41"></path>
                  <path d="M17.66 6.34l1.41-1.41"></path>
              </svg>

              {/* Moon (Dark Mode) */}
              <svg 
                  className={`absolute inset-0 w-full h-full text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)] transition-all duration-500
                    ${isDark ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-90'}
                  `}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
          </div>
      </div>
      
      {/* Label Text */}
      <div className={`flex flex-col whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out
          ${isPinned ? 'w-auto opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-4 absolute pointer-events-none group-hover/sidebar:relative group-hover/sidebar:w-auto group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-4 group-hover/sidebar:pl-1'}
      `}>
         <span className={`text-sm tracking-wide font-bold transition-colors duration-300
             ${isDark ? 'text-white group-hover/theme:text-blue-400' : 'text-slate-900 group-hover/theme:text-amber-600'}
         `}>
             {isDark ? 'Dark Mode' : 'Light Mode'}
         </span>
         <span className={`text-[10px] font-medium tracking-wider uppercase opacity-70 transition-colors duration-300
             ${isDark ? 'text-gray-400' : 'text-slate-500'}
         `}>
            Theme
         </span>
      </div>
    </button>
  );
}
