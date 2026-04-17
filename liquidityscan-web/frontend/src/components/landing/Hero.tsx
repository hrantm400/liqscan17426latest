import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '../ui/Button';
import { ArrowRight, ShieldCheck, Activity, Target } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const PremiumSVGScanner = () => {
  return (
    <div className="relative w-full aspect-[4/3] md:aspect-video rounded-2xl overflow-hidden bg-white dark:bg-[#0A0D14] border border-slate-200 dark:border-[#1A1F2E] shadow-2xl group flex items-center justify-center transition-colors duration-500">
      
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(26,31,46,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(26,31,46,0.3)_1px,transparent_1px)] bg-[size:20px_20px]" />
      
      {/* Glow Orbs */}
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px]"
      />
      <motion.div 
        animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px]"
      />

      <svg className="absolute inset-0 w-full h-full" overflow="visible" viewBox="0 0 800 450" preserveAspectRatio="none">
        {/* Dynamic Sweeping Radar/Scanner Line */}
        <motion.line
          x1="-100" y1="0" x2="-100" y2="450"
          stroke="url(#scannerGradient)" strokeWidth="4"
          animate={{ x1: [0, 900], x2: [0, 900] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
        
        <defs>
          <linearGradient id="scannerGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#13ec37" stopOpacity="0" />
            <stop offset="50%" stopColor="#13ec37" stopOpacity="1" />
            <stop offset="100%" stopColor="#13ec37" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="bullishCandle" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#13ec37" stopOpacity="1" />
            <stop offset="100%" stopColor="#13ec37" stopOpacity="0.4" />
          </linearGradient>
          
          <linearGradient id="bearishCandle" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
            <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.4" />
          </linearGradient>

          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Generated Candlesticks */}
        {Array.from({ length: 40 }).map((_, i) => {
          const x = 20 + i * 20;
          const isBull = i % 3 !== 0 && i % 5 !== 0; // Pseudo random pattern
          const height = 20 + Math.random() * 80;
          const y = 300 - height - (Math.random() * 100);
          
          return (
            <g key={i}>
              <motion.line 
                x1={x + 4} y1={y - 20} x2={x + 4} y2={y + height + 20} 
                stroke={isBull ? "#13ec37" : "#ef4444"} strokeWidth="1" opacity="0.5"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.5 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
              />
              <motion.rect 
                x={x} y={y} width="8" height={height} rx="2"
                fill={isBull ? "url(#bullishCandle)" : "url(#bearishCandle)"}
                initial={{ height: 0, y: y + height, opacity: 0 }}
                animate={{ height: height, y: y, opacity: 1 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
              />
            </g>
          );
        })}

        {/* Liquidity Heatmap Zone */}
        <motion.rect 
          x="300" y="80" width="200" height="40" rx="4"
          fill="#13ec37" fillOpacity="0.1" stroke="#13ec37" strokeWidth="1" strokeDasharray="4 4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2, duration: 1 }}
        />
        <motion.text 
          x="310" y="105" fill="#13ec37" fontSize="12" fontFamily="monospace" fontWeight="bold"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}
        >
          [SUPER ENGULFING: HIGH VOL]
        </motion.text>

        {/* Signal Detection Point */}
        <motion.circle 
          cx="624" cy="180" r="6" fill="#13ec37" filter="url(#glow)"
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} 
          transition={{ delay: 2.5, duration: 2, repeat: Infinity }}
        />
        
        {/* Trend Line */}
        <motion.path 
          d="M 24 300 Q 200 350 400 200 T 780 150" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 5" opacity="0.6"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, delay: 1 }}
        />

      </svg>
      
      {/* Front Overlay UI */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <div className="flex items-center gap-3 bg-white/80 dark:bg-[#0A0D14]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 px-4 py-2 rounded-lg transition-colors">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-slate-900 dark:text-white font-mono text-sm tracking-wider">LIVE SCAN: BTC/USDT</span>
        </div>
        <div className="bg-primary/10 border border-primary/30 text-primary px-3 py-1 rounded text-xs font-bold uppercase tracking-widest hidden sm:block">
          Algorithmic Engine v3.0
        </div>
      </div>

    </div>
  );
};

export const Hero: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <section className="relative min-h-screen pt-32 pb-20 overflow-hidden flex items-center bg-transparent">
      
      <div className="max-w-[1400px] mx-auto px-6 w-full relative z-10">
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* Left Column: Serious Typography */}
          <motion.div
            style={{ y: y1, opacity }}
            className="relative z-20 flex flex-col items-start text-left"
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 mb-8 backdrop-blur-md transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono text-slate-600 dark:text-gray-300 uppercase tracking-widest">
                Trusted by 10,000+ Retail & Pro Traders
              </span>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="font-display text-5xl sm:text-6xl md:text-[80px] font-black leading-[1.05] tracking-tight text-slate-900 dark:text-white mb-6"
            >
              Trade Like The <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-600 via-slate-400 to-slate-500 dark:from-white dark:via-gray-300 dark:to-gray-500">
                Algorithms.
              </span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-slate-600 dark:text-gray-400 text-lg md:text-xl mb-10 max-w-xl leading-relaxed font-light"
            >
              Stop reacting to price action. Anticipate it. Our advanced scanner detects <span className="text-slate-900 dark:text-white font-medium">Super Engulfing candles, CRT reversals, Bias trends, and RSI Momentum</span> in real-time across 300+ crypto assets.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
            >
              <Link to={isAuthenticated ? "/dashboard" : "/register"} className="w-full sm:w-auto">
                <Button className="w-full bg-primary text-black hover:bg-primary/90 text-lg px-8 py-6 h-auto font-bold rounded-xl shadow-[0_0_30px_-5px_rgba(19,236,55,0.4)] transition-all">
                  {isAuthenticated ? "Open Terminal" : "Start Free 7-Day Trial"} <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <a href="#how-it-works" className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full text-lg px-8 py-6 h-auto bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white rounded-xl transition-all">
                   View Live Demo
                </Button>
              </a>
            </motion.div>

            {/* Micro Stats */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 1 }}
              className="mt-14 grid grid-cols-3 gap-6 sm:gap-12 pt-8 border-t border-slate-200 dark:border-white/10 w-full max-w-lg transition-colors"
            >
               <div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">4 algos</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 uppercase tracking-widest mt-1">Multi-Strategy</div>
               </div>
               <div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">&lt;50ms</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 uppercase tracking-widest mt-1">Latency</div>
               </div>
               <div>
                  <div className="text-2xl font-black text-primary font-mono">1m-1W</div>
                  <div className="text-xs text-slate-500 dark:text-gray-500 uppercase tracking-widest mt-1">Timeframes</div>
               </div>
            </motion.div>
          </motion.div>

          {/* Right Column: Premium SVG Visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="relative lg:block"
          >
            <PremiumSVGScanner />
            
            {/* Floating Glass Cards covering edges of scanner */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1 }}
              className="absolute -bottom-8 -left-8 bg-white/90 dark:bg-[#0A0D14]/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-2xl flex items-center gap-4 z-20 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-gray-400 font-mono">SIGNAL FIRED</div>
                <div className="text-slate-900 dark:text-white font-bold">ETH Long (CRT)</div>
              </div>
            </motion.div>

             <motion.div 
              initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.2 }}
              className="absolute -top-8 -right-8 bg-white/90 dark:bg-[#0A0D14]/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-2xl flex items-center gap-4 z-20 hidden md:flex transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-gray-400 font-mono">TREND CHANGE</div>
                <div className="text-slate-900 dark:text-white font-bold">BTC Bias Shift</div>
              </div>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};
