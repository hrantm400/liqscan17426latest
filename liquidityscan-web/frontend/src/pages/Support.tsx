import { useState } from 'react';
import { motion } from 'framer-motion';
import { scaleInVariants, staggerContainer, listItemVariants } from '../utils/animations';

export function Support() {
  const [searchQuery, setSearchQuery] = useState('');

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
            <span className="dark:hover:text-white light:hover:text-text-dark cursor-pointer transition-colors">Tools</span>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-primary drop-shadow-[0_0_5px_rgba(19,236,55,0.5)]">Support</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black tracking-tight dark:text-white light:text-text-dark flex items-center gap-3">
              Support Center
              <span className="px-2 py-0.5 rounded text-[10px] font-bold dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 dark:text-gray-400 light:text-text-light-secondary uppercase tracking-wider align-middle border">
                Live Feed
              </span>
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-xs dark:text-gray-400 light:text-text-light-secondary font-medium">
                Last updated: <span className="dark:text-white light:text-text-dark">Just now</span>
              </span>
              <button className="p-2 rounded-lg dark:bg-white/5 light:bg-green-50 dark:hover:bg-white/10 light:hover:bg-green-100 dark:text-gray-400 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark transition-colors border dark:border-transparent light:border-green-300">
                <span className="material-symbols-outlined text-xl">refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pb-4 md:px-8 md:pb-8 overflow-hidden flex flex-col">
        <div className="glass-panel w-full h-full rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center relative overflow-y-auto custom-scrollbar border dark:border-white/5 light:border-green-300">
          <div className="w-full max-w-5xl flex flex-col items-center gap-10 z-10">
            <motion.div variants={scaleInVariants} className="text-center space-y-3">
              <h2 className="text-5xl md:text-6xl font-black dark:text-white light:text-text-dark tracking-tight drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                Support & Help
              </h2>
              <p className="dark:text-gray-400 light:text-text-light-secondary text-lg">How can we assist you with your trading journey today?</p>
            </motion.div>

            {/* Search */}
            <motion.div variants={scaleInVariants} className="w-full max-w-2xl relative group">
              <div className="absolute inset-0 bg-primary/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity rounded-full duration-500"></div>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-6 dark:text-gray-500 light:text-text-light-secondary group-focus-within:text-primary transition-colors text-2xl">
                  search
                </span>
                <input
                  className="w-full pl-16 pr-6 py-4 rounded-full dark:bg-[#0a140d]/80 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:placeholder:text-gray-600 light:text-slate-400 light:placeholder:text-text-light-secondary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-xl text-lg backdrop-blur-md"
                  placeholder="Search Help Articles..."
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </motion.div>

            {/* Help Categories */}
            <motion.div 
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full mt-4"
            >
              <motion.div variants={listItemVariants} className="glass-panel p-5 rounded-xl border dark:border-white/10 light:border-green-300 hover:border-primary dark:hover:bg-white/[0.07] light:hover:bg-green-100 transition-all duration-300 cursor-pointer group flex flex-row items-center gap-4 hover:shadow-[0_0_20px_rgba(19,236,55,0.2)]">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl dark:text-gray-400 light:text-text-light-secondary group-hover:text-primary transition-colors">
                    rocket_launch
                  </span>
                </div>
                <span className="font-bold dark:text-gray-200 light:text-text-dark dark:group-hover:text-white light:group-hover:text-text-dark text-base text-left">Getting Started</span>
              </motion.div>

              <motion.div variants={listItemVariants} className="glass-panel p-5 rounded-xl border dark:border-white/10 light:border-green-300 hover:border-primary dark:hover:bg-white/[0.07] light:hover:bg-green-100 transition-all duration-300 cursor-pointer group flex flex-row items-center gap-4 hover:shadow-[0_0_20px_rgba(19,236,55,0.2)]">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl dark:text-gray-400 light:text-text-light-secondary group-hover:text-primary transition-colors">
                    build
                  </span>
                </div>
                <span className="font-bold dark:text-gray-200 light:text-text-dark dark:group-hover:text-white light:group-hover:text-text-dark text-base text-left">Troubleshooting Signals</span>
              </motion.div>

              <motion.div variants={listItemVariants} className="glass-panel p-5 rounded-xl border dark:border-white/10 light:border-green-300 hover:border-primary dark:hover:bg-white/[0.07] light:hover:bg-green-100 transition-all duration-300 cursor-pointer group flex flex-row items-center gap-4 hover:shadow-[0_0_20px_rgba(19,236,55,0.2)]">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl dark:text-gray-400 light:text-text-light-secondary group-hover:text-primary transition-colors">
                    calculate
                  </span>
                </div>
                <span className="font-bold dark:text-gray-200 light:text-text-dark dark:group-hover:text-white light:group-hover:text-text-dark text-base text-left">Risk Calculator Usage</span>
              </motion.div>

              <motion.div variants={listItemVariants} className="glass-panel p-5 rounded-xl border dark:border-white/10 light:border-green-300 hover:border-primary dark:hover:bg-white/[0.07] light:hover:bg-green-100 transition-all duration-300 cursor-pointer group flex flex-row items-center gap-4 hover:shadow-[0_0_20px_rgba(19,236,55,0.2)]">
                <div className="flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl dark:text-gray-400 light:text-text-light-secondary group-hover:text-primary transition-colors">
                    receipt_long
                  </span>
                </div>
                <span className="font-bold dark:text-gray-200 light:text-text-dark dark:group-hover:text-white light:group-hover:text-text-dark text-base text-left">Billing & Plans</span>
              </motion.div>
            </motion.div>

            {/* Support Actions */}
            <motion.div 
              variants={scaleInVariants}
              className="flex flex-col items-center gap-6 mt-8 p-4 md:p-8 rounded-2xl border dark:border-white/5 light:border-green-300 dark:bg-[#0a140d]/40 light:bg-green-50 w-full max-w-3xl backdrop-blur-sm"
            >
              <h3 className="dark:text-white light:text-text-dark font-bold text-xl tracking-tight">Need further assistance?</h3>
              <div className="flex flex-wrap justify-center gap-4 w-full">
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-3.5 rounded-xl bg-primary hover:bg-primary-hover text-black font-extrabold shadow-[0_0_20px_rgba(19,236,55,0.4)] transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-xl">confirmation_number</span>
                  Submit a Ticket
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-3.5 rounded-xl dark:bg-white/5 light:bg-white dark:hover:bg-white/10 light:hover:bg-green-50 border dark:border-white/10 light:border-green-300 dark:hover:border-white/30 light:hover:border-green-400 dark:text-white light:text-text-dark font-bold transition-all flex items-center gap-2 backdrop-blur-md"
                >
                  <span className="material-symbols-outlined text-xl">chat</span>
                  Chat with Support
                </motion.button>
              </div>
              <p className="text-xs dark:text-gray-500 light:text-text-light-secondary font-mono tracking-wide flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                Average response time: <span className="text-primary font-bold">24h</span>
              </p>
            </motion.div>

            {/* Knowledge Base Link */}
            <motion.a
              variants={scaleInVariants}
              href="#"
              className="text-primary dark:hover:text-white light:hover:text-text-dark text-sm font-bold mt-2 transition-all flex items-center gap-1.5 group border-b border-transparent hover:border-primary pb-0.5"
            >
              <span className="material-symbols-outlined text-lg">menu_book</span>
              <span>Visit Knowledge Base</span>
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </motion.a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
