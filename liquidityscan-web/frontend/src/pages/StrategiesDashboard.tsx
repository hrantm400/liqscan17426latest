import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { staggerContainer, scaleInVariants, listItemVariants } from '../utils/animations';

export const StrategiesDashboard: React.FC = () => {
  return (
    <motion.div
      className="flex flex-col h-full"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={staggerContainer}
    >
      {/* Header */}
      <div className="flex flex-col gap-6 px-4 pt-4 pb-2 md:px-8 md:pt-8 md:pb-4 shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-medium dark:text-gray-500 light:text-text-light-secondary uppercase tracking-wider">
            <span className="dark:hover:text-white light:hover:text-text-dark cursor-pointer transition-colors">Monitor</span>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-primary drop-shadow-[0_0_5px_rgba(19,236,55,0.5)]">My Strategies</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black tracking-tight dark:text-white light:text-text-dark flex items-center gap-3">
              My Strategies
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-xs dark:text-gray-400 light:text-slate-500 font-medium">Last updated: <span className="dark:text-white light:text-text-dark">Just now</span></span>
              <button className="p-2 rounded-lg dark:bg-white/5 light:bg-slate-100 dark:hover:bg-white/10 light:hover:bg-slate-200 dark:text-gray-400 light:text-slate-500 dark:hover:text-white light:hover:text-text-dark transition-colors">
                <span className="material-symbols-outlined text-xl">refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 px-4 pb-4 md:px-8 md:pb-8 flex flex-col overflow-y-auto custom-scrollbar">
        <motion.div
          className="mb-12"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* Strategy cards — placeholders (strategy id 1 removed) */}
            {[2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13].map((num) => (
              <Link key={num} to={`/strategies/${num}`}>
                <motion.div
                  variants={scaleInVariants}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="widget-card glass-panel rounded-2xl flex flex-col h-[200px] relative z-10 p-6 group cursor-pointer dark:hover:bg-white/5 light:hover:bg-green-100/50 transition-all border dark:border-white/5 light:border-green-300"
                >
                  <div className="flex items-start justify-between mb-auto">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:shadow-[0_0_15px_rgba(19,236,55,0.2)] transition-all">
                        <span className="material-symbols-outlined text-xl">star</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold dark:text-white light:text-text-dark group-hover:text-primary transition-colors">Strategy {num}</h3>
                        <span className="text-[10px] dark:text-gray-400 light:text-text-light-secondary tracking-wide font-mono">CUSTOM-{String(num).padStart(2, '0')}</span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined dark:text-gray-600 light:text-text-light-secondary text-xl dark:group-hover:text-white light:group-hover:text-text-dark transition-colors">arrow_outward</span>
                  </div>
                  <div className="flex items-end justify-between mt-4">
                    <div>
                      <span className="block text-2xl font-black dark:text-white light:text-text-dark tracking-tight">0</span>
                      <span className="text-[10px] font-bold dark:text-gray-500 light:text-text-light-secondary uppercase tracking-wider">Signals Found</span>
                    </div>
                    <div className="h-8 w-16 bg-primary/10 rounded flex items-center justify-center border border-primary/20 opacity-60">
                      <svg className="w-full h-full text-primary p-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 50 20">
                        <path d="M0 10 L10 5 L20 15 L30 5 L40 10 L50 8"></path>
                      </svg>
                    </div>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        <motion.div
          variants={listItemVariants}
          className="mt-8 flex justify-center opacity-30"
        >
          <span className="text-xs font-mono text-primary uppercase tracking-[0.5em]">System Operational • V2.4.0</span>
        </motion.div>
      </div>
    </motion.div>
  );
};
