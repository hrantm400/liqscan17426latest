import { motion } from 'framer-motion';
import { Target, TrendingUp, Activity } from 'lucide-react';

const FeatureCard = ({ title, desc, icon: Icon, delay, children }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ duration: 0.7, delay }}
    className="group relative min-h-[440px] flex flex-col justify-between overflow-hidden rounded-2xl bg-white dark:bg-[#0A0D14] border border-slate-200 dark:border-[#1A1F2E] hover:border-primary/50 dark:hover:border-primary/30 transition-all duration-500 shadow-xl hover:shadow-[0_0_40px_-15px_rgba(19,236,55,0.15)]"
  >
    {/* Inner background glow on hover */}
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

    <div className="p-8 relative z-10 flex-1 flex flex-col">
      <div className="w-14 h-14 bg-slate-50 dark:bg-[#050608] border border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-center mb-8 group-hover:border-primary/40 group-hover:shadow-[0_0_15px_rgba(19,236,55,0.2)] transition-all">
        <Icon className="w-6 h-6 text-slate-500 dark:text-gray-400 group-hover:text-primary transition-colors" />
      </div>
      <h3 className="text-2xl font-bold mb-4 font-display text-slate-900 dark:text-white tracking-tight transition-colors">{title}</h3>
      <p className="text-slate-600 dark:text-gray-400 leading-relaxed font-light transition-colors">{desc}</p>
    </div>

    {/* Custom Animated Visualization Slot */}
    <div className="h-[200px] w-full relative mt-auto border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#050608] overflow-hidden transition-colors">
      {children}
    </div>
  </motion.div>
);

export const Features: React.FC = () => {
  return (
    <section id="features" className="py-24 relative overflow-hidden bg-transparent">
      {/* Background gradients */}
      <div className="absolute right-0 top-1/4 w-[500px] h-[500px] bg-primary/10 dark:bg-primary/5 blur-[150px] rounded-full pointer-events-none opacity-50 transition-colors" />
      <div className="absolute left-0 bottom-1/4 w-[500px] h-[500px] bg-blue-600/10 dark:bg-blue-600/5 blur-[150px] rounded-full pointer-events-none opacity-50 transition-colors" />

      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        
        <div className="text-center mb-24 max-w-3xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once:true }}
            className="inline-block mb-6 px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-xs font-mono tracking-widest text-primary uppercase transition-colors"
          >
            Core Algorithms
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} transition={{ delay: 0.1 }}
            className="font-display text-4xl md:text-6xl font-black mb-6 tracking-tight text-slate-900 dark:text-white transition-colors"
          >
            Institutional-Grade <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-green-500 dark:to-green-200">Detection Engine</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} transition={{ delay: 0.2 }}
            className="text-slate-600 dark:text-gray-400 text-lg md:text-xl font-light leading-relaxed transition-colors"
          >
            Our infrastructure ingests millisecond-level tick data from Tier-1 exchanges to detect the 4 most powerful algorithmic footprints that manual retail traders miss.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          
          {/* Feature 1: Super Engulfing */}
          <FeatureCard 
            title="Super Engulfing Signals" 
            desc="Our flagship algorithm detects massive, sudden liquidity sweeps with volume filtration. Spot genuine institutional demand zones and avoid fakeouts before they happen."
            icon={Target}
            delay={0.1}
          >
            {/* SVG Viz for Super Engulfing */}
            <svg className="w-full h-full opacity-60 group-hover:opacity-100 transition-opacity" viewBox="0 0 400 200" preserveAspectRatio="none">
               {/* Grid */}
               <pattern id="grid1" width="20" height="20" patternUnits="userSpaceOnUse">
                 <path d="M 20 0 L 0 0 0 20" fill="none" className="stroke-slate-200 dark:stroke-white/5" strokeWidth="1"/>
               </pattern>
               <rect width="100%" height="100%" fill="url(#grid1)" />
               
               {/* Candles */}
               <motion.rect x="80" y="100" width="10" height="40" fill="#ef4444" opacity="0.8" />
               <motion.rect x="110" y="110" width="10" height="50" fill="#ef4444" opacity="0.8" />
               <motion.rect x="140" y="130" width="10" height="30" fill="#ef4444" opacity="0.8" />
               <motion.rect x="170" y="140" width="10" height="20" fill="#ef4444" opacity="0.8" />
               
               {/* Huge Bullish Engulfing */}
               <motion.rect x="200" y="60" width="14" height="110" fill="#13ec37" opacity="0.9"
                 initial={{ height: 0, y: 170 }} animate={{ height: 110, y: 60 }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }} />
               
               {/* Volume Spikes */}
               <motion.rect x="200" y="180" width="14" height="40" fill="#13ec37" opacity="0.5"
                 initial={{ height: 0, y: 220 }} animate={{ height: 40, y: 180 }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }} />
               
               {/* Laser Sweep */}
               <motion.line x1="0" y1="0" x2="0" y2="200" stroke="#13ec37" strokeWidth="2" opacity="0.5"
                 animate={{ x1: [0, 400], x2: [0, 400] }} transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }} />
            </svg>
            <div className="absolute top-4 right-4 bg-primary/10 border border-primary/30 text-primary text-[10px] font-mono px-2 py-1 rounded">Volume Spike: 450%</div>
          </FeatureCard>

          {/* Feature 2: Bias */}
          <FeatureCard 
            title="Trend Bias Alignment" 
            desc="Never trade against the macro trend again. Our Bias engine perfectly aligns lower timeframe action with HTF momentum, filtering out low-probability chop."
            icon={TrendingUp}
            delay={0.2}
          >
            {/* SVG Viz for Bias */}
            <div className="absolute inset-0 flex items-center justify-center">
               <svg className="w-full h-full relative z-10 opacity-70 group-hover:opacity-100 transition-opacity" viewBox="0 0 400 200" preserveAspectRatio="none">
                 <pattern id="grid2" width="20" height="20" patternUnits="userSpaceOnUse">
                   <path d="M 20 0 L 0 0 0 20" fill="none" className="stroke-slate-200 dark:stroke-white/5" strokeWidth="1"/>
                 </pattern>
                 <rect width="100%" height="100%" fill="url(#grid2)" />
                 
                 {/* Macro Trend Line */}
                 <motion.path 
                   d="M 40 160 Q 150 140 250 80 T 360 40" 
                   fill="none" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="8" strokeLinecap="round"
                   initial={{ pathLength: 0 }} 
                   animate={{ pathLength: 1 }} 
                   transition={{ duration: 3, repeat: Infinity }}
                 />
                 
                 {/* Micro Trend Line overlapping */}
                 <motion.path 
                   d="M 40 160 Q 100 120 150 150 T 250 80 Q 280 40 360 40" 
                   fill="none" stroke="#13ec37" strokeWidth="2"
                   initial={{ pathLength: 0 }} 
                   animate={{ pathLength: 1 }} 
                   transition={{ duration: 3, repeat: Infinity, delay: 0.3 }}
                 />
                 
                 {/* Alignment point */}
                 <motion.circle 
                   cx="250" cy="80" r="8" fill="#13ec37" opacity="0.8"
                   animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0.3, 0.8] }}
                   transition={{ duration: 1.5, repeat: Infinity }}
                 />
               </svg>
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex justify-between font-mono text-[10px] text-slate-500 dark:text-gray-500">
               <span>4H BIAS: BULLISH</span>
               <span className="text-primary font-bold">15m ALIGNED</span>
            </div>
          </FeatureCard>

          {/* Feature 3: CRT and RSI */}
          <FeatureCard 
               title="CRT & RSI Reversals" 
               desc="Confluence is king. We combine Constant Range Timeframe (CRT) anomalies with extreme RSI divergence to pinpoint exact, high-probability market pivot points."
               icon={Activity}
               delay={0.3}
             >
               {/* SVG Viz for CRT / RSI */}
               <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent z-0" />
               <svg className="w-full h-full relative z-10 opacity-70 group-hover:opacity-100 transition-opacity" viewBox="0 0 400 200" preserveAspectRatio="none">
                 <pattern id="grid3" width="20" height="20" patternUnits="userSpaceOnUse">
                   <path d="M 20 0 L 0 0 0 20" fill="none" className="stroke-slate-200 dark:stroke-white/5" strokeWidth="1"/>
                 </pattern>
                 <rect width="100%" height="100%" fill="url(#grid3)" />

                 {/* RSI Bounds */}
                 <rect x="0" y="140" width="400" height="40" fill="rgba(59, 130, 246, 0.1)" />
                 <line x1="0" y1="140" x2="400" y2="140" stroke="rgba(59, 130, 246, 0.5)" strokeWidth="1" strokeDasharray="4 4" />
                 <line x1="0" y1="180" x2="400" y2="180" stroke="rgba(59, 130, 246, 0.5)" strokeWidth="1" strokeDasharray="4 4" />
                 
                 {/* RSI Line dipping into oversold */}
                 <motion.path 
                   d="M 40 160 Q 150 150 200 190 T 360 150" 
                   fill="none" stroke="#13ec37" strokeWidth="2"
                   initial={{ pathLength: 0 }} 
                   animate={{ pathLength: 1 }} 
                   transition={{ duration: 2.5, repeat: Infinity }}
                 />
                 
                 {/* Candle dropping into CRT zone */}
                 <motion.rect x="195" y="40" width="10" height="60" fill="#ef4444" opacity="0.8"
                   initial={{ height: 0 }} animate={{ height: 60 }} transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.5 }} />
                 <motion.rect x="195" y="100" width="10" height="20" fill="#13ec37" opacity="0.9"
                   initial={{ height: 0, y: 120 }} animate={{ height: 20, y: 100 }} transition={{ duration: 0.5, delay: 1, repeat: Infinity, repeatDelay: 2 }} />

                 {/* Convergence Highlight */}
                 <motion.circle 
                   cx="200" cy="190" r="15" 
                   fill="none" stroke="#13ec37" strokeWidth="2"
                   initial={{ scale: 0, opacity: 1 }} 
                   animate={{ scale: 3, opacity: 0 }} 
                   transition={{ duration: 1, repeat: Infinity, delay: 1.2, repeatDelay: 1.5 }}
                 />
               </svg>
               <div className="absolute top-4 right-4 bg-blue-500/10 border border-blue-500/30 text-blue-500 text-[10px] font-mono px-2 py-1 rounded">RSI Divergence: 25.4</div>
             </FeatureCard>

        </div>
      </div>
    </section>
  );
};
