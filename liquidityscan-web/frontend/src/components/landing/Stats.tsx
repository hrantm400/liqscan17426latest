import React, { useEffect, useRef } from 'react';
import { motion, useInView, useSpring, useMotionValue } from 'framer-motion';

const stats = [
  { label: "Markets Scanned", value: 300, suffix: "+", sub: "Binance & Bybit (Tick Level)" },
  { label: "Win Rate (Verified)", value: 78.4, suffix: "%", sub: "Across All Strategies" },
  { label: "System Uptime", value: 99.99, suffix: "%", sub: "Enterprise Cluster" },
  { label: "Execution Latency", value: 24, prefix: "<", suffix: "ms", sub: "Rust-Based Matching Engine" },
];

const AnimatedNumber = ({ value, prefix = "", suffix = "" }: { value: number, prefix?: string, suffix?: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { damping: 50, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, value, motionValue]);

  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = latest.toFixed(value % 1 === 0 ? 0 : 1);
      }
    });
  }, [springValue, value]);

  return (
    <span className="flex items-center justify-center gap-0.5">
      {prefix && <span className="text-slate-500 dark:text-gray-500 font-light">{prefix}</span>}
      <span ref={ref}>0</span>
      {suffix && <span className="text-primary font-light">{suffix}</span>}
    </span>
  );
};

export const Stats: React.FC = () => {
  return (
    <section className="py-16 border-y border-slate-200 dark:border-[#1A1F2E] bg-white/80 dark:bg-[#0A0D14]/80 backdrop-blur-xl relative overflow-hidden z-20 transition-colors duration-500">
       <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(20,25,35,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(20,25,35,0.4)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none"></div>
       <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
       
      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center lg:text-left divide-x divide-slate-200 dark:divide-white/5 transition-colors">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="px-6 relative group"
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-primary/0 group-hover:bg-primary/10 dark:group-hover:bg-primary/5 blur-xl rounded-full transition-colors duration-500" />
              <div className="font-display text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white mb-3 tracking-tighter transition-colors">
                <AnimatedNumber value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
              </div>
              <div className="text-slate-700 dark:text-white font-bold text-sm uppercase tracking-widest mb-1.5 flex flex-col lg:flex-row items-center lg:items-center gap-2 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {stat.label}
              </div>
              <div className="text-slate-500 dark:text-gray-500 text-xs font-mono transition-colors">
                {stat.sub}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
