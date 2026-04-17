import React from 'react';
import { motion } from 'framer-motion';

interface FeatureComparisonProps {
  subscriptions: any[];
}

const getDisplayName = (sub: any) => {
  if (sub.tier === 'FULL_ACCESS') return 'Full Access';
  if (sub.tier === 'SCOUT') return 'Free Forever';
  return sub.name || 'Plan';
};

export const FeatureComparison: React.FC<FeatureComparisonProps> = ({ subscriptions }) => {
  const getPairsValue = (subscription: any) => {
    if (subscription.pairsLimit == null) return 'Unlimited';
    if (subscription.pairsLimit === 4) {
      const pairs = subscription.limits?.pairs;
      if (Array.isArray(pairs) && pairs.length === 4) {
        return 'BTC, ETH, EURUSD, XAUUSD';
      }
      return '4 pairs';
    }
    return `${subscription.pairsLimit} Pairs`;
  };

  const getTimeframesValue = (subscription: any) => {
    const tf = Array.isArray(subscription.timeframes) ? subscription.timeframes : [];
    if (tf.length === 0) return '—';
    if (tf.includes('5m')) return 'All (Inc. 5m Scalp)';
    if (tf.length >= 4) return 'All';
    if (tf.length === 2 && tf.includes('4H') && (tf.includes('Daily') || tf.includes('1D'))) return '4H+';
    return tf.join(', ');
  };

  const getSignalsValue = (subscription: any) => {
    const st = Array.isArray(subscription.signalTypes) ? subscription.signalTypes : [];
    if (st.length === 0) return '—';
    if (st.includes('Standard') && (st.includes('REV+') || st.includes('RUN+'))) return 'All';
    if (st.includes('REV+') && st.includes('RUN+')) return 'REV+ / RUN+';
    if (st.includes('Standard')) return 'Standard';
    return st.join(', ');
  };

  const getStrategiesValue = (subscription: any) => {
    if (subscription.tier === 'FULL_ACCESS') return 'All';
    return 'Standard REV/RUN only';
  };

  const getIndicatorValue = (subscription: any) => {
    if (subscription.tier === 'FULL_ACCESS') return 'Yes';
    return '—';
  };

  const getAdvancedFiltersValue = (subscription: any) => {
    const limits = subscription.limits || {};
    if (limits.contextFilters === false) return 'No (OB, RSI Div)';
    if (limits.contextFilters === true || subscription.tier === 'FULL_ACCESS') return 'Yes (OB, RSI Div)';
    return '—';
  };

  const features = [
    { name: 'Pairs', getValue: getPairsValue },
    { name: 'Timeframes', getValue: getTimeframesValue },
    { name: 'Signals', getValue: getSignalsValue },
    { name: 'Strategies', getValue: getStrategiesValue },
    { name: 'Indicator', getValue: getIndicatorValue },
    { name: 'Smart Filters', getValue: getAdvancedFiltersValue },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 overflow-hidden shadow-sm"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <th className="text-left py-4 px-5 text-slate-600 dark:text-slate-400 font-medium text-sm">
                Feature
              </th>
              {subscriptions.map((sub) => (
                <th
                  key={sub.id}
                  className="text-center py-4 px-5 text-slate-900 dark:text-white font-semibold text-sm"
                >
                  {getDisplayName(sub)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, rowIndex) => (
              <tr
                key={feature.name}
                className={`border-b border-slate-100 dark:border-slate-800/80 ${
                  rowIndex % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''
                }`}
              >
                <td className="py-3.5 px-5 text-slate-600 dark:text-slate-300 text-sm font-medium">
                  {feature.name}
                </td>
                {subscriptions.map((sub) => {
                  const value = feature.getValue(sub);
                  return (
                    <td key={sub.id} className="py-3.5 px-5 text-center">
                      <span className="text-slate-600 dark:text-slate-300 text-sm">{value}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};
