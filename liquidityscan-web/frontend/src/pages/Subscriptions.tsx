import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { userApi } from '../services/userApi';
import { PaymentWidget } from '../components/PaymentWidget';
import { PageHero } from '../components/shared/PageHero';

export function Subscriptions() {
  const { user } = useAuthStore();
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [tier, setTier] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const daysRemaining = typeof tier?.daysRemaining === 'number'
    ? tier.daysRemaining
    : (user?.subscriptionExpiresAt
      ? Math.max(0, Math.ceil((new Date(user.subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null);

  useEffect(() => {
    // Fetch tier (may fail if not logged in)
    userApi.getTier()
      .then(setTier)
      .catch(() => {
        console.warn('Could not fetch user tier');
      });

    // Fetch plans independently
    userApi.getSubscriptions()
      .then(plansData => {
        setPlans(plansData.filter((p: any) => !String(p?.name || '').toLowerCase().includes('test')));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch subscriptions', err);
        setLoading(false);
      });
  }, []);

  const isPaid = tier?.isPaid || user?.subscriptionId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-6 max-w-5xl mx-auto space-y-5"
    >
      <PageHero
        eyebrow={isPaid ? 'Pro · Active' : 'Upgrade'}
        icon={isPaid ? 'workspace_premium' : 'rocket_launch'}
        title={isPaid ? "You're Pro" : 'Upgrade to Pro'}
        subtitle={isPaid
          ? 'Full access unlocked. All strategies, unlimited signals, Telegram alerts.'
          : 'Unlock 500+ pairs, all strategies, and Telegram God Mode alerts.'}
        tone={isPaid ? 'primary' : 'amber'}
        unboxed
      />

      {/* Current Status */}
      {isPaid && (
        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="glass-panel rounded-2xl p-5 md:p-6 relative overflow-hidden">
          <span aria-hidden className="pointer-events-none absolute -top-12 -left-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 border border-primary/40 text-primary shadow-glow-md">
                <span className="material-symbols-outlined text-[24px]">workspace_premium</span>
              </span>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-primary">Plan</div>
                <div className="text-xl font-black dark:text-white light:text-text-dark">Full Access</div>
              </div>
            </div>
            {(typeof daysRemaining === 'number' || user?.subscriptionExpiresAt) && (
              <div className="flex items-center gap-3">
                {typeof daysRemaining === 'number' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border dark:bg-white/[0.03] light:bg-white/70 dark:border-white/10 light:border-green-300">
                    <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest dark:text-gray-500 light:text-text-light-secondary leading-none">Remaining</div>
                      <div className="mt-0.5 text-sm font-black dark:text-white light:text-text-dark leading-none">
                        {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                )}
                {user?.subscriptionExpiresAt && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border dark:bg-white/[0.03] light:bg-white/70 dark:border-white/10 light:border-green-300">
                    <span className="material-symbols-outlined text-primary text-[18px]">event</span>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest dark:text-gray-500 light:text-text-light-secondary leading-none">Expires</div>
                      <div className="mt-0.5 text-sm font-black dark:text-white light:text-text-dark leading-none">
                        {new Date(user.subscriptionExpiresAt as string).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Plan Comparison */}
      {!showPayment && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {plans.map((plan: any) => {
            const isScout = plan.tier === 'SCOUT';
            const isPro = plan.tier === 'FULL_ACCESS';

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass-panel rounded-2xl overflow-hidden flex flex-col relative ${isPro ? 'ring-2 ring-primary/40' : ''
                  }`}
              >
                {isPro && (
                  <div className="absolute top-4 right-4 bg-primary text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}

                <div className={`p-4 md:p-6 border-b ${isPro ? 'border-primary/10 bg-primary/[0.03]' : 'dark:border-white/5 light:border-gray-100'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPro ? 'bg-primary/20 border border-primary/30' : 'dark:bg-white/5 light:bg-gray-100'
                      }`}>
                      <span className={`material-symbols-outlined ${isPro ? 'text-primary' : 'dark:text-gray-400 light:text-gray-500'}`}>
                        {isScout ? 'person' : 'diamond'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold dark:text-white light:text-text-dark">{plan.name}</h3>
                      <p className={`text-[10px] uppercase tracking-widest font-bold ${isPro ? 'text-primary' : 'dark:text-gray-500 light:text-gray-400'}`}>
                        {isScout ? 'Starter' : 'Full Access'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black dark:text-white light:text-text-dark">
                      ${plan.priceMonthly === 0 ? '0' : plan.priceMonthly}
                    </span>
                    {plan.priceMonthly > 0 && (
                      <>
                        <span className="text-sm dark:text-gray-500 light:text-gray-400 line-through">$49</span>
                        <span className="text-sm dark:text-gray-400 light:text-gray-500">/1st month</span>
                      </>
                    )}
                    {plan.priceMonthly === 0 && <span className="text-sm font-normal dark:text-gray-500 light:text-gray-400">/forever</span>}
                  </div>
                  {isPro && <p className="text-xs text-primary mt-1">50% OFF first month • Then $49/mo</p>}
                </div>

                <div className="p-4 md:p-6 space-y-3 flex-1 flex flex-col">
                  {plan.features?.map((feature: string) => (
                    <div key={feature} className="flex items-center gap-3 text-sm">
                      <span className="material-symbols-outlined text-base text-primary">check_circle</span>
                      <span className="dark:text-gray-300 light:text-gray-600">{feature}</span>
                    </div>
                  ))}

                  <div className="flex-1" />

                  {!isScout && !isPaid && (
                    <button
                      onClick={() => { setSelectedPlan(plan); setShowPayment(true); }}
                      className="w-full mt-4 py-4 md:py-3 rounded-2xl bg-primary text-black font-bold text-base transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_rgba(19,236,55,0.2)] flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-xl md:text-base">bolt</span>
                      Upgrade Now
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Payment Widget */}
      {showPayment && !isPaid && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <PaymentWidget
            onSuccess={() => { setShowPayment(false); setSelectedPlan(null); window.location.reload(); }}
            onClose={() => { setShowPayment(false); setSelectedPlan(null); }}
            planPrice={selectedPlan ? Number(selectedPlan.priceMonthly) : undefined}
            planName={selectedPlan?.name}
          />
        </motion.div>
      )}

      {/* Value Proposition */}
      {!isPaid && !showPayment && (
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-black dark:text-gray-400 light:text-gray-500 uppercase tracking-widest mb-4">Why Pro?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: 'trending_up', title: '90%+ Win Rate', desc: 'Proven on majors with SE + ICT Bias strategies' },
              { icon: 'notifications_active', title: 'Telegram Alerts', desc: 'Real-time PNG signal cards pushed to your phone' },
              { icon: 'query_stats', title: '15+ Strategies', desc: 'SE, RSI Divergence, ICT Bias, CRT, and more' },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-xl dark:bg-white/[0.02] light:bg-gray-50 border dark:border-white/5 light:border-gray-200">
                <span className="material-symbols-outlined text-primary text-2xl mb-2 block">{item.icon}</span>
                <h4 className="font-bold dark:text-white light:text-text-dark text-sm mb-1">{item.title}</h4>
                <p className="text-xs dark:text-gray-400 light:text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
