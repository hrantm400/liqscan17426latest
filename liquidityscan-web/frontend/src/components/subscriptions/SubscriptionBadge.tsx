import React from 'react';
import { motion } from 'framer-motion';

interface SubscriptionBadgeProps {
  subscription?: any;
  status?: string;
}

export const SubscriptionBadge: React.FC<SubscriptionBadgeProps> = ({ subscription, status }) => {
  if (!subscription) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20"
      >
        <span className="text-xs font-medium dark:text-gray-400 light:text-slate-500">Free Plan</span>
      </motion.div>
    );
  }

  const getStatusColor = () => {
    switch (status) {
      case 'active':
        return 'bg-primary/20 text-primary border-primary/30';
      case 'expired':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'cancelled':
        return 'bg-gray-500/20 dark:text-gray-400 light:text-slate-500 border-gray-500/30';
      default:
        return 'bg-white/10 dark:text-gray-400 light:text-slate-500 border-white/20';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${getStatusColor()}`}
    >
      <span className="text-xs font-bold uppercase">{subscription.tier}</span>
      {status && (
        <span className="text-xs font-medium opacity-75">
          {status === 'active' ? 'Active' : status}
        </span>
      )}
    </motion.div>
  );
};
