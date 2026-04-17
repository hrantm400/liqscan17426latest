import React from 'react';
import { motion } from 'framer-motion';
import { userApi } from '../../services/userApi';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';

interface SubscriptionCardProps {
  subscription: any;
  currentSubscriptionId?: string | null;
  index: number;
}

const getIcon = (tier: string) => {
  if (tier === 'FULL_ACCESS') return 'bolt';
  return 'explore';
};
const getSubtitle = (tier: string) => {
  if (tier === 'FULL_ACCESS') return 'All features · 30 days';
  return 'Free Forever · The Drug';
};
const getDisplayName = (tier: string, name: string) => {
  if (tier === 'FULL_ACCESS') return 'Full Access';
  if (tier === 'SCOUT') return 'Free Forever';
  return name || 'Plan';
};
const getButtonText = (tier: string, isCurrent: boolean, isFree: boolean) => {
  if (isCurrent) return 'Active Plan';
  if (isFree) return 'Get Started Free';
  if (tier === 'FULL_ACCESS') return 'Get Full Access';
  return 'Subscribe';
};

export const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  subscription,
  currentSubscriptionId,
  index,
}) => {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const subscribeMutation = useMutation({
    mutationFn: () => userApi.subscribeToPlan(subscription.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mySubscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const isCurrentPlan = currentSubscriptionId === subscription.id;
  const price = subscription.priceMonthly ?? subscription.price ?? 0;
  const isFree = price === 0;
  const features = Array.isArray(subscription.features)
    ? subscription.features
    : typeof subscription.features === 'string'
      ? [subscription.features]
      : [];
  const displayFeatures = features.slice(0, 5);

  const handleSubscribe = () => {
    if (!isAuthenticated) {
      window.location.href = '/login';
      return;
    }
    if (isFree) {
      subscribeMutation.mutate();
    } else {
      userApi
        .createPayment(price, 'USD', subscription.id)
        .then((payment) => {
          window.location.href = payment.paymentUrl || `/payment/${payment.id}`;
        })
        .catch((error) => {
          console.error('Failed to create payment:', error);
          alert(`Failed to create payment: ${error.message || 'Unknown error'}`);
        });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
              {getDisplayName(subscription.tier, subscription.name)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider font-medium">
              {getSubtitle(subscription.tier)}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <span className="material-symbols-outlined text-xl">{getIcon(subscription.tier)}</span>
          </div>
        </div>

        {/* Price */}
        <div className="px-6 py-4 border-y border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              ${price}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">/month</span>
          </div>
        </div>

        {/* Features */}
        <ul className="px-6 py-5 flex-1 space-y-3">
          {displayFeatures.map((feature: string, idx: number) => {
            const hasFeature =
              !feature.startsWith('✗') && !feature.toLowerCase().includes('no');
            return (
              <li key={idx} className="flex items-start gap-3 text-sm">
                {hasFeature ? (
                  <span className="material-symbols-outlined text-emerald-500 text-base flex-shrink-0 mt-0.5">
                    check_circle
                  </span>
                ) : (
                  <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-base flex-shrink-0 mt-0.5">
                    remove
                  </span>
                )}
                <span
                  className={
                    hasFeature
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-400 dark:text-slate-500 line-through'
                  }
                >
                  {feature.replace(/^[✓✗◎]\s*/, '')}
                </span>
              </li>
            );
          })}
        </ul>

        {/* CTA */}
        <div className="px-6 pb-6 pt-2">
          {isCurrentPlan ? (
            <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-sm font-medium">
              <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
              Active Plan
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleSubscribe}
              disabled={subscribeMutation.isPending}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {subscribeMutation.isPending
                ? 'Processing...'
                : getButtonText(subscription.tier, isCurrentPlan, isFree)}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
