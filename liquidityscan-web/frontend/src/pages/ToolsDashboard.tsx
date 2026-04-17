import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PageHeader } from '../components/layout/PageHeader';
import { staggerContainer } from '../utils/animations';

/**
 * Two fixed utilities: risk sizing + Super Engulfing pattern lab.
 * Kept as a vertical stack on all breakpoints so both are always visible (no deploy confusion).
 */
export const ToolsDashboard: React.FC = () => {
  return (
    <motion.div
      className="flex flex-col h-full min-h-0"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={staggerContainer}
    >
      <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 shrink-0">
        <PageHeader breadcrumbs={[{ label: 'Tools' }]} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-8">
        <div className="max-w-xl mx-auto w-full flex flex-col gap-6 pt-2">
          <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">
            Planning tools and the interactive pattern lab for learning Super Engulfing setups.
          </p>

          <Link
            to="/risk-calculator"
            className="glass-panel block p-8 rounded-2xl border dark:border-white/10 light:border-green-200/80 hover:border-primary/50 dark:hover:bg-white/[0.04] light:hover:bg-green-50/80 transition-all duration-300 group flex flex-col gap-5 hover:shadow-[0_0_28px_rgba(19,236,55,0.12)]"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/12 border border-primary/25 flex items-center justify-center text-primary group-hover:shadow-[0_0_20px_rgba(19,236,55,0.25)] transition-all">
                <span className="material-symbols-outlined text-3xl">calculate</span>
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="text-xl font-black dark:text-white light:text-text-dark group-hover:text-primary transition-colors">
                  Risk calculator
                </h2>
                <span className="text-xs dark:text-gray-500 light:text-slate-500">
                  Balance, risk %, entry & stop → size & margin
                </span>
              </div>
            </div>
            <p className="text-sm dark:text-gray-400 light:text-text-light-secondary leading-relaxed">
              Estimate position size from how much of your account you are willing to risk and where your stop is.
            </p>
            <div className="flex items-center gap-2 text-primary text-sm font-bold pt-2">
              <span>Open calculator</span>
              <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>
          </Link>

          <Link
            to="/superengulfing"
            className="glass-panel block p-8 rounded-2xl border dark:border-white/10 light:border-green-200/80 hover:border-indigo-400/50 dark:hover:bg-white/[0.04] light:hover:bg-green-50/80 transition-all duration-300 group flex flex-col gap-5 hover:shadow-[0_0_28px_rgba(99,102,241,0.15)]"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/12 border border-indigo-500/25 flex items-center justify-center text-indigo-400 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.25)] transition-all">
                <span className="material-symbols-outlined text-3xl">school</span>
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="text-xl font-black dark:text-white light:text-text-dark group-hover:text-indigo-400 transition-colors">
                  Pattern lab
                </h2>
                <span className="text-xs dark:text-gray-500 light:text-slate-500">
                  Super Engulfing — visualizer &amp; practice
                </span>
              </div>
            </div>
            <p className="text-sm dark:text-gray-400 light:text-text-light-secondary leading-relaxed">
              Interactive charts, RUN / REV / PLUS patterns, and quizzes to learn the strategy outside live markets.
            </p>
            <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold pt-2">
              <span>Open pattern lab</span>
              <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>
          </Link>
        </div>
      </div>
    </motion.div>
  );
};
