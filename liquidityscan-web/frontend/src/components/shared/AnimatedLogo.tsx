import React from 'react';

interface AnimatedLogoProps {
  className?: string;
}

export const AnimatedLogo: React.FC<AnimatedLogoProps> = ({ className = "w-10 h-10" }) => {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      <style>
        {`
          .ls-radar {
            transform-origin: 50% 50%;
            animation: ls-scan 4s linear infinite;
          }
          @keyframes ls-scan {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* Outer Rings: Classic elegant framing */}
      <circle cx="50" cy="50" r="44" className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="28" className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="44" stroke="#13ec37" strokeWidth="1.5" strokeDasharray="10 20" opacity="0.3" className="ls-radar" />
      
      {/* The Radar Sweep */}
      <g className="ls-radar">
        <path d="M50 50 L50 6 A44 44 0 0 1 94 50 Z" fill="#13ec37" opacity="0.1" />
        <line x1="50" y1="50" x2="50" y2="6" stroke="#13ec37" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Elegant Candlesticks */}
      {/* Left Candle */}
      <line x1="36" y1="42" x2="36" y2="62" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="2" strokeLinecap="round" />
      <rect x="33" y="47" width="6" height="10" rx="1.5" className="fill-slate-400 dark:fill-slate-500" />
      
      {/* Center Main Candle (The Engulfing Signal) */}
      <line x1="50" y1="26" x2="50" y2="74" stroke="#13ec37" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="45.5" y="36" width="9" height="24" rx="2" fill="#13ec37" />
      
      {/* Right Candle */}
      <line x1="64" y1="36" x2="64" y2="52" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="2" strokeLinecap="round" />
      <rect x="61" y="40" width="6" height="8" rx="1.5" className="fill-slate-400 dark:fill-slate-500" />

      {/* Center Core */}
      <circle cx="50" cy="50" r="2.5" className="fill-slate-900 dark:fill-white" />
    </svg>
  );
};
