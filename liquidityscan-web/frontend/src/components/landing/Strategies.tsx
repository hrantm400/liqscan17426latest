import React from 'react';
import { motion } from 'framer-motion';
import { BarChart, Scale, TrendingDown, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const strategies = [
  {
    icon: BarChart,
    title: "Super Engulfing Engine",
    desc: "Detects massive candle engulfing patterns backed by 3x volume spikes. Optimized for trend reversals and catching tops/bottoms.",
    color: "from-primary/20",
    textColor: "text-primary",
    border: "group-hover:border-primary/50 dark:group-hover:border-primary/50",
    winRate: "78.4%",
    signals: "20-40/day"
  },
  {
    icon: Scale,
    title: "ICT Bias & Order Blocks",
    desc: "Institutional order block detection coupled with Fair Value Gaps (FVG) to identify smart money entry points and liquidity sweeps.",
    color: "from-blue-500/20",
    textColor: "text-blue-500 dark:text-blue-400",
    border: "group-hover:border-blue-500/50 dark:group-hover:border-blue-500/50",
    winRate: "75.2%",
    signals: "15-25/day"
  },
  {
    icon: TrendingDown,
    title: "Algorithmic RSI Divergence",
    desc: "Automated momentum divergence. Spots exactly when price makes a higher high but buying momentum completely drops off.",
    color: "from-purple-500/20",
    textColor: "text-purple-500 dark:text-purple-400",
    border: "group-hover:border-purple-500/50 dark:group-hover:border-purple-500/50",
    winRate: "72.8%",
    signals: "10-20/day"
  }
];

export const Strategies: React.FC = () => {
  return (
    <section id="strategies" className="py-32 relative overflow-hidden bg-slate-50 dark:bg-[#06080A] transition-colors duration-500">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[500px] bg-primary/10 dark:bg-primary/5 blur-[120px] rounded-full pointer-events-none transition-colors" />

      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div className="mb-24 flex flex-col md:flex-row justify-between items-end gap-8">
           <div className="max-w-2xl">
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once:true }}
               className="inline-block mb-6 px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white shadow-sm dark:bg-white/5 text-xs font-mono tracking-widest text-primary uppercase transition-colors"
             >
               Proprietary Algorithms
             </motion.div>
             <motion.h2 
               initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} transition={{ delay: 0.1 }}
               className="font-display text-4xl md:text-6xl font-black mb-6 tracking-tight text-slate-900 dark:text-white transition-colors"
             >
               Data-Driven <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-600 dark:from-white dark:to-gray-500">Execution.</span>
             </motion.h2>
             <motion.p 
               initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} transition={{ delay: 0.2 }}
               className="text-slate-600 dark:text-gray-400 text-lg md:text-xl font-light leading-relaxed transition-colors"
             >
               Three distinct algorithms actively monitoring 300+ markets, 24/7. No emotions, just pure mathematical edge.
             </motion.p>
           </div>
           
           <motion.div 
             initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once:true }} transition={{ delay: 0.3 }}
           >
              <Link to="/register" className="inline-flex items-center gap-2 text-primary hover:text-slate-900 dark:hover:text-white font-mono uppercase tracking-widest transition-colors group">
                View All Metrics <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
           </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {strategies.map((strategy, idx) => {
            const Icon = strategy.icon;
            return (
              <motion.div 
                key={idx} 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.7, delay: idx * 0.15 }}
                className={`group relative rounded-2xl bg-white dark:bg-[#0A0D14] border border-slate-200 dark:border-[#1A1F2E] ${strategy.border} cursor-pointer transition-all duration-500 overflow-hidden shadow-sm hover:shadow-xl`}
              >
                 {/* Hover Gradient Background */}
                 <div className={`absolute inset-0 bg-gradient-to-b ${strategy.color} to-transparent opacity-0 group-hover:opacity-10 dark:group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`} />
                 
                 <div className="p-8 relative z-10 flex flex-col h-full">
                   <div className="flex justify-between items-start mb-10">
                     <div className={`w-14 h-14 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-[#050608] border border-slate-200 dark:border-white/10 group-hover:border-slate-300 dark:group-hover:border-white/20 transition-colors`}>
                       <Icon className={`w-6 h-6 ${strategy.textColor}`} />
                     </div>
                     <div className="flex gap-2 bg-slate-100 dark:bg-transparent px-2 py-1 rounded-md transition-colors">
                       <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mt-2" />
                       <span className="text-[10px] font-mono text-slate-500 dark:text-gray-500 uppercase tracking-widest mt-1">Active</span>
                     </div>
                   </div>
                   
                   <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 font-display tracking-tight transition-colors">
                     {strategy.title}
                   </h3>
                   
                   <p className="text-slate-600 dark:text-gray-400 font-light leading-relaxed mb-8 flex-grow transition-colors">
                     {strategy.desc}
                   </p>
                   
                   {/* Data Points */}
                   <div className="flex items-center gap-6 pt-6 border-t border-slate-100 dark:border-white/5 transition-colors">
                     <div>
                       <div className={`text-xl font-bold font-mono ${strategy.textColor}`}>{strategy.winRate}</div>
                       <div className="text-[10px] text-slate-400 dark:text-gray-500 uppercase tracking-widest mt-1">Win Rate</div>
                     </div>
                     <div className="w-[1px] h-8 bg-slate-200 dark:bg-white/10 transition-colors" />
                     <div>
                       <div className="text-xl font-bold font-mono text-slate-700 dark:text-gray-300 transition-colors">{strategy.signals}</div>
                       <div className="text-[10px] text-slate-400 dark:text-gray-500 uppercase tracking-widest mt-1">Avg Signals</div>
                     </div>
                   </div>
                 </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  );
};
