import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TimezoneSelector } from '../settings/TimezoneSelector';

interface TimezoneGateProps {
  isOpen: boolean;
  onComplete: () => void;
}

export const TimezoneGate: React.FC<TimezoneGateProps> = ({ isOpen, onComplete }) => {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full max-w-lg glass-panel rounded-2xl p-8 border dark:border-white/10 light:border-green-300 shadow-2xl relative overflow-hidden"
          >
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[60px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10 text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/20 text-primary mx-auto mb-6 flex items-center justify-center ring-4 dark:ring-white/10 light:ring-green-200">
                <span className="material-symbols-outlined text-3xl">language</span>
              </div>
              <h2 className="text-3xl font-black dark:text-white light:text-text-dark mb-3">Set Your Timezone</h2>
              <p className="text-sm dark:text-gray-400 light:text-text-light-secondary leading-relaxed max-w-md mx-auto">
                Before you start using LiquidityScanner, please select your local timezone. All trading signals and charts will automatically adjust to display in your selected time.
              </p>
            </div>

            <div className="bg-background-dark/30 rounded-xl p-6 border border-white/5 mb-6 text-left relative z-10">
              <label className="block text-sm font-bold dark:text-gray-300 light:text-text-dark mb-3">
                Select your local timezone
              </label>
              <TimezoneSelector standalone onSuccess={onComplete} />
            </div>

            <p className="text-[11px] dark:text-gray-500 light:text-slate-400 text-center mt-6">
              You can always change this later in your platform Settings.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
