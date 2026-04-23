import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { PageHero } from '../components/shared/PageHero';
import { staggerContainer } from '../utils/animations';

export const DailyRecap: React.FC = () => {
  return (
    <motion.div
      className="flex flex-col h-full min-h-0"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={staggerContainer}
    >
      <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 shrink-0">
        <PageHeader breadcrumbs={[{ label: 'Daily Recap' }]} />
      </div>
      <div className="px-4 md:px-6 shrink-0">
        <PageHero
          eyebrow="Reports · Daily"
          icon="auto_awesome"
          title="Daily Recap"
          subtitle="Day-over-day signal performance summary."
          tone="primary"
          unboxed
        />
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-12 mt-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="glass-panel max-w-md w-full rounded-2xl border dark:border-white/10 light:border-green-200/80 p-10 text-center relative overflow-hidden shadow-glow-md"
        >
          <span aria-hidden className="pointer-events-none absolute -top-12 -left-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl animate-pulse-slow" />
          <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/12 border border-primary/25 text-primary mb-6 mx-auto shadow-glow-sm">
            <Sparkles className="w-7 h-7" strokeWidth={1.5} aria-hidden />
          </div>
          <span className="relative inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 mb-3">
            <span className="material-symbols-outlined text-[12px]">hourglass_top</span>
            Coming soon
          </span>
          <h2 className="relative text-2xl font-black dark:text-white light:text-text-dark mb-2">In the works</h2>
          <p className="relative text-sm dark:text-slate-400 light:text-slate-600 leading-relaxed">
            We&apos;re building a daily performance summary for your signals. Check back later.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};
