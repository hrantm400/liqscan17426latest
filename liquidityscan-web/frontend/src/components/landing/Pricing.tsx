import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { Check, ShieldCheck, Zap } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const plans = [
  {
    name: "Standard",
    price: "$49",
    period: "/month",
    description: "Essential analytics for active retail traders.",
    features: ["Real-time Super Engulfing Scanner", "Top 50 High-Volume Pairs", "Standard Alerts (Discord)", "24h Historical Data"],
    cta: "Start 7-Day Trial",
    popular: false,
    link: "/register"
  },
  {
    name: "Professional",
    price: "$149",
    period: "/month",
    description: "Unrestricted access to all proprietary algorithms.",
    features: ["All 300+ Pairs & Markets", "Sub-50ms Execution Alerts", "ICT Bias & Order Blocks", "CRT & RSI Reversals", "Priority Webhooks & Telegram"],
    cta: "Upgrade to Professional",
    popular: true,
    link: "/register"
  },
  {
    name: "Institutional",
    price: "Custom",
    period: "",
    description: "Dedicated infrastructure for prop firms and funds.",
    features: ["Dedicated Raw Data Feeds", "White-label API Access", "Custom Algorithm Development", "1-on-1 Engineering Support", "Account Manager"],
    cta: "Contact Sales",
    popular: false,
    link: "/support"
  }
];

export const Pricing: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <section id="pricing" className="py-32 relative overflow-hidden bg-slate-50 dark:bg-[#06080A] transition-colors duration-500">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 dark:bg-primary/5 rounded-full blur-[150px] pointer-events-none transition-colors" />
      
      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div className="text-center mb-20 max-w-3xl mx-auto">
          <motion.div 
             initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once:true }}
             className="inline-block mb-6 px-4 py-1.5 rounded-full border border-slate-200 shadow-sm dark:border-white/10 bg-white dark:bg-white/5 text-xs font-mono tracking-widest text-primary uppercase transition-colors"
          >
             Access Tiers
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} transition={{ delay: 0.1 }}
            className="font-display text-4xl md:text-5xl font-black mb-6 tracking-tight text-slate-900 dark:text-white transition-colors"
          >
            Transparent <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-green-500 dark:to-green-200">Pricing.</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once:true }} transition={{ delay: 0.2 }}
            className="text-slate-600 dark:text-gray-400 max-w-2xl mx-auto text-lg md:text-xl font-light transition-colors"
          >
            Institutional-grade data at a fraction of the cost. Scale your trading operation without limits.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          {plans.map((plan, idx) => (
            <motion.div 
              key={idx} 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.15 }}
              className={`relative flex flex-col p-8 rounded-2xl bg-white dark:bg-[#0A0D14] transition-all duration-300 ${plan.popular ? 'border border-primary shadow-[0_0_50px_-15px_rgba(19,236,55,0.3)] z-10 md:-translate-y-4' : 'border border-slate-200 shadow-sm md:shadow-none dark:border-[#1A1F2E]'}`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-black font-bold px-4 py-1.5 rounded-full text-xs uppercase tracking-widest flex items-center gap-1.5 shadow-[0_0_20px_rgba(19,236,55,0.4)]">
                  <Zap className="w-3 h-3" /> Most Popular
                </div>
              )}
              
              <div className="mb-8">
                <h3 className="text-xl text-slate-900 dark:text-white font-bold mb-2 font-display transition-colors">{plan.name}</h3>
                <p className="text-sm text-slate-600 dark:text-gray-500 min-h-[40px] leading-relaxed mb-6 transition-colors">{plan.description}</p>
                <div className="flex items-baseline">
                  <span className="text-5xl font-bold text-slate-900 dark:text-white font-display tracking-tighter transition-colors">{plan.price}</span>
                  <span className="text-slate-500 dark:text-gray-500 ml-2 font-mono text-sm transition-colors">{plan.period}</span>
                </div>
              </div>

              <div className="flex-1 mb-10 space-y-5">
                {plan.features.map((feature, fIdx) => (
                  <div key={fIdx} className="flex items-start gap-3">
                    <div className={`mt-0.5 p-0.5 rounded-full ${plan.popular ? 'bg-primary text-black' : 'bg-slate-100 dark:bg-[#1A1F2E] text-primary'}`}>
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700 dark:text-gray-300 text-sm leading-relaxed transition-colors">{feature}</span>
                  </div>
                ))}
              </div>

              <Link to={isAuthenticated ? "/subscription" : plan.link} className="w-full">
                <Button 
                  className={`w-full justify-center py-6 text-base font-bold rounded-xl transition-all ${plan.popular ? 'bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_-5px_rgba(19,236,55,0.4)]' : 'bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                >
                  {plan.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
        
        {/* Trust Banner */}
        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           whileInView={{ opacity: 1, y: 0 }}
           viewport={{ once: true }}
           transition={{ delay: 0.6 }}
           className="mt-16 py-6 border-y border-slate-200 dark:border-white/5 flex flex-col sm:flex-row items-center justify-center gap-4 text-center text-sm text-slate-500 dark:text-gray-400 font-mono uppercase tracking-widest transition-colors"
        >
           <ShieldCheck className="w-5 h-5 text-primary" />
           <span>256-Bit SSL Encryption</span>
           <span className="hidden sm:inline">•</span>
           <span>Cancel Anytime</span>
           <span className="hidden sm:inline">•</span>
           <span>Instant Access</span>
        </motion.div>
      </div>
    </section>
  );
};
