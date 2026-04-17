import React from 'react';
import { motion } from 'framer-motion';
import { Cable, Sliders, LineChart, Wallet, ArrowRight } from 'lucide-react';

const steps = [
  {
    icon: Cable,
    title: "Connect Exchange",
    desc: "Link your Binance or Bybit account via read-only API keys. Your funds remain 100% safe."
  },
  {
    icon: Sliders,
    title: "Select Strategy",
    desc: "Choose from our pre-built institutional algorithms or customize parameters to fit your style."
  },
  {
    icon: LineChart,
    title: "Receive Signals",
    desc: "Get instant alerts via Telegram, Discord, or Webhook when high-probability setups are detected."
  },
  {
    icon: Wallet,
    title: "Execute & Profit",
    desc: "Enter trades with confidence using our defined invalidation levels and take-profit targets."
  }
];

export const HowItWorks: React.FC = () => {
  return (
    <section className="py-32 relative overflow-hidden bg-slate-50 dark:bg-[#06080A] transition-colors duration-500">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-[600px] h-[600px] bg-blue-500/10 dark:bg-blue-500/5 blur-[150px] rounded-full transition-colors" />
        <div className="absolute bottom-1/4 right-0 w-[600px] h-[600px] bg-primary/10 dark:bg-primary/5 blur-[150px] rounded-full transition-colors" />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div className="text-center mb-32">
          <motion.div 
             initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once:true }}
             className="inline-block mb-6 px-4 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white shadow-sm dark:bg-white/5 text-xs font-mono tracking-widest text-primary uppercase transition-colors"
          >
             Deployment
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} transition={{ delay: 0.1 }}
            className="font-display text-4xl md:text-5xl font-black mb-6 tracking-tight text-slate-900 dark:text-white transition-colors"
          >
            From Setup To First Trade In <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-green-500 dark:to-green-200">Under 5 Minutes.</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} transition={{ delay: 0.2 }}
            className="text-slate-600 dark:text-gray-400 max-w-2xl mx-auto text-lg md:text-xl font-light transition-colors"
          >
            No complex coding required. Our platform is designed for immediate execution out of the box.
          </motion.p>
        </div>

        <div className="relative">
          {/* Animated Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-[48px] left-[10%] right-[10%] h-[1px] bg-slate-200 dark:bg-[#1A1F2E] z-0 transition-colors">
             <motion.div 
               className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-primary to-transparent"
               initial={{ x: "-100%", width: "50%" }}
               animate={{ x: "200%" }}
               transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
             />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 relative z-10">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.15, duration: 0.6 }}
                  className="relative group"
                >
                  <div className="flex flex-col items-center text-center">
                    {/* Icon Container */}
                    <div className="relative w-24 h-24 mb-10">
                      <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="w-full h-full rounded-2xl bg-white dark:bg-[#0A0D14] shadow-md hover:shadow-xl dark:shadow-none border border-slate-200 dark:border-[#1A1F2E] flex items-center justify-center relative z-10 group-hover:border-primary/50 group-hover:shadow-[0_0_30px_rgba(19,236,55,0.2)] transition-all duration-300">
                        <Icon className="w-8 h-8 text-slate-400 dark:text-gray-500 group-hover:text-primary transition-colors duration-300" />
                      </div>
                      
                      {/* Step Number Badge */}
                      <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary text-black rounded-full flex items-center justify-center text-xs font-bold font-mono z-20 shadow-[0_0_15px_rgba(19,236,55,0.4)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform scale-50 group-hover:scale-100">
                        0{idx + 1}
                      </div>
                    </div>

                    <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white font-display tracking-tight transition-colors">
                      {step.title}
                    </h3>
                    <p className="text-slate-600 dark:text-gray-400 text-sm leading-relaxed max-w-[250px] mx-auto font-light min-h-[80px] transition-colors">
                      {step.desc}
                    </p>
                    
                    {/* Mobile Arrow */}
                    {idx < steps.length - 1 && (
                      <div className="md:hidden mt-8 text-slate-300 dark:text-[#1A1F2E] transition-colors">
                        <ArrowRight className="w-6 h-6 rotate-90 mx-auto" />
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
