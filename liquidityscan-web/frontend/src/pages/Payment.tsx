import { useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '../services/userApi';
import { motion } from 'framer-motion';

const WIDGET_URL = 'https://nowpayments.io/embeds/payment-widget';
const POLL_INTERVAL_MS = 10000;

export function Payment() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');

  const {
    data: payment,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['paymentStatus', id],
    queryFn: () => userApi.getPaymentStatus(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (payment?.status === 'pending' && payment?.paymentId) {
      const t = setInterval(() => refetch(), POLL_INTERVAL_MS);
      return () => clearInterval(t);
    }
  }, [payment?.status, payment?.paymentId, refetch]);

  if (!id) {
    return (
      <PaymentScreen tone="rose" icon="error">
        <h1 className="text-2xl font-black dark:text-white light:text-slate-900 mb-2">Invalid payment link</h1>
        <p className="text-sm dark:text-gray-400 light:text-slate-500 mb-5">
          The link looks malformed. Try again from your Subscriptions page.
        </p>
        <BackToSubscriptions />
      </PaymentScreen>
    );
  }

  if (isLoading) {
    return (
      <PaymentScreen tone="primary" icon="hourglass_top">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="mx-auto w-10 h-10 border-2 border-primary/40 border-t-primary rounded-full mb-4"
        />
        <p className="text-sm dark:text-gray-400 light:text-slate-500">Checking payment status…</p>
      </PaymentScreen>
    );
  }

  if (error || !payment) {
    return (
      <PaymentScreen tone="amber" icon="error_outline">
        <h1 className="text-2xl font-black dark:text-white light:text-slate-900 mb-2">Payment not found</h1>
        <p className="text-sm dark:text-gray-400 light:text-slate-500 mb-5">
          {error instanceof Error ? error.message : 'We could not look up this payment.'}
        </p>
        <BackToSubscriptions />
      </PaymentScreen>
    );
  }

  if (payment.status === 'completed') {
    return (
      <PaymentScreen tone="primary" icon="check_circle">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 mb-3">
            <span className="material-symbols-outlined text-[12px]">verified</span>
            Subscription active
          </span>
          <h1 className="text-2xl font-black dark:text-white light:text-slate-900 mb-2">Payment completed</h1>
          <p className="text-sm dark:text-gray-400 light:text-slate-500 mb-6">
            Your subscription is active. Full Access features are unlocked.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-black px-5 py-2.5 font-black tracking-wide uppercase shadow-glow-md hover:shadow-glow-lg hover:bg-primary-hover transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              Dashboard
            </Link>
            <Link
              to="/subscriptions"
              className="inline-flex items-center justify-center gap-2 rounded-xl border dark:border-white/10 light:border-green-300 dark:bg-white/[0.04] light:bg-white px-5 py-2.5 font-bold dark:text-white light:text-slate-900 hover:border-primary/40 hover:text-primary transition-all"
            >
              Subscriptions
            </Link>
          </div>
        </motion.div>
      </PaymentScreen>
    );
  }

  if (statusParam === 'cancel') {
    return (
      <PaymentScreen tone="amber" icon="cancel">
        <h1 className="text-2xl font-black dark:text-white light:text-slate-900 mb-2">Payment cancelled</h1>
        <p className="text-sm dark:text-gray-400 light:text-slate-500 mb-5">You can try again anytime.</p>
        <BackToSubscriptions />
      </PaymentScreen>
    );
  }

  if (statusParam === 'success' && payment.status === 'pending') {
    return (
      <PaymentScreen tone="primary" icon="schedule">
        <h1 className="text-2xl font-black dark:text-white light:text-slate-900 mb-2">Payment received</h1>
        <p className="text-sm dark:text-gray-400 light:text-slate-500 mb-5">
          Your subscription will activate shortly. This page will update automatically.
        </p>
        <BackToSubscriptions />
      </PaymentScreen>
    );
  }

  if (payment.status === 'pending' && payment.paymentId) {
    const widgetSrc = `${WIDGET_URL}?iid=${encodeURIComponent(payment.paymentId)}`;
    return (
      <div className="min-h-screen dark:bg-background-dark light:bg-background-light py-10 px-4 relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light opacity-90" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
        <span aria-hidden className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative max-w-md mx-auto glass-panel rounded-3xl p-6 md:p-8 shadow-glow-md">
          <Link
            to="/subscriptions"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:underline mb-4"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Subscriptions
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 mb-3">
            <span className="material-symbols-outlined text-[12px]">currency_bitcoin</span>
            Crypto payment
          </span>
          <h1 className="text-xl font-black dark:text-white light:text-slate-900 mb-2">Complete payment</h1>
          <p className="text-sm dark:text-gray-400 light:text-slate-500 mb-5">
            Use the widget below to pay with crypto. Your subscription will activate after confirmation.
          </p>
          <div className="rounded-xl border dark:border-white/10 light:border-green-300 bg-white dark:bg-slate-900/70 overflow-hidden">
            <iframe
              src={widgetSrc}
              width="410"
              height="696"
              frameBorder="0"
              scrolling="no"
              style={{ overflowY: 'hidden', maxWidth: '100%' }}
              title="NOWPayments"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PaymentScreen tone="amber" icon="error_outline">
      <h1 className="text-2xl font-black dark:text-white light:text-slate-900 mb-2">Cannot continue</h1>
      <p className="text-sm dark:text-gray-400 light:text-slate-500 mb-5">
        This payment cannot be completed here. Please start again from Subscriptions.
      </p>
      <BackToSubscriptions />
    </PaymentScreen>
  );
}

const TONE_RING: Record<'primary' | 'amber' | 'rose', { bg: string; border: string; text: string }> = {
  primary: { bg: 'bg-primary/10', border: 'border-primary/30', text: 'text-primary' },
  amber: { bg: 'bg-amber-400/10', border: 'border-amber-400/30', text: 'text-amber-400' },
  rose: { bg: 'bg-rose-400/10', border: 'border-rose-400/30', text: 'text-rose-400' },
};

const PaymentScreen: React.FC<{
  tone: 'primary' | 'amber' | 'rose';
  icon: string;
  children: React.ReactNode;
}> = ({ tone, icon, children }) => {
  const t = TONE_RING[tone];
  return (
    <div className="min-h-screen dark:bg-background-dark light:bg-background-light flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light opacity-90" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
      <span aria-hidden className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative max-w-md w-full glass-panel rounded-2xl p-7 text-center shadow-glow-md">
        <div className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border ${t.bg} ${t.border} ${t.text}`}>
          <span className="material-symbols-outlined text-[28px]">{icon}</span>
        </div>
        {children}
      </div>
    </div>
  );
};

const BackToSubscriptions: React.FC = () => (
  <Link
    to="/subscriptions"
    className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-primary hover:underline"
  >
    <span className="material-symbols-outlined text-[14px]">arrow_back</span>
    Back to Subscriptions
  </Link>
);
