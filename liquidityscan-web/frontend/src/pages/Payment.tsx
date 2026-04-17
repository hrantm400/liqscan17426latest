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
      <div className="min-h-screen dark:bg-background-dark light:bg-background-light flex items-center justify-center px-6">
        <div className="text-center glass-panel rounded-2xl p-8">
          <p className="text-slate-600 dark:text-slate-400 mb-4">Invalid payment link.</p>
          <Link
            to="/subscriptions"
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Back to Subscriptions
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen dark:bg-background-dark light:bg-background-light flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full"
        />
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {error instanceof Error ? error.message : 'Payment not found.'}
          </p>
          <Link
            to="/subscriptions"
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Back to Subscriptions
          </Link>
        </div>
      </div>
    );
  }

  if (payment.status === 'completed') {
    return (
      <div className="min-h-screen dark:bg-background-dark light:bg-background-light flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md glass-panel rounded-2xl p-8"
        >
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
            Payment completed
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Your subscription is active. You can use Full Access features now.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 text-white px-5 py-2.5 font-medium hover:bg-emerald-500 transition"
          >
            Go to Dashboard
          </Link>
          <span className="mx-2 text-slate-400">or</span>
          <Link
            to="/subscriptions"
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            View Subscriptions
          </Link>
        </motion.div>
      </div>
    );
  }

  if (statusParam === 'cancel') {
    return (
      <div className="min-h-screen dark:bg-background-dark light:bg-background-light flex items-center justify-center px-6">
        <div className="text-center glass-panel rounded-2xl p-8">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
            Payment cancelled
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            You can try again anytime.
          </p>
          <Link
            to="/subscriptions"
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Back to Subscriptions
          </Link>
        </div>
      </div>
    );
  }

  if (statusParam === 'success' && payment.status === 'pending') {
    return (
      <div className="min-h-screen dark:bg-background-dark light:bg-background-light flex items-center justify-center px-6">
        <div className="text-center max-w-md glass-panel rounded-2xl p-8">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
            Payment received
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Your subscription will activate shortly. This page will update automatically.
          </p>
          <Link
            to="/subscriptions"
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Back to Subscriptions
          </Link>
        </div>
      </div>
    );
  }

  if (payment.status === 'pending' && payment.paymentId) {
    const widgetSrc = `${WIDGET_URL}?iid=${encodeURIComponent(payment.paymentId)}`;
    return (
      <div className="min-h-screen dark:bg-background-dark light:bg-background-light py-12 px-6">
        <div className="max-w-md mx-auto glass-panel rounded-3xl p-8">
          <Link
            to="/subscriptions"
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline mb-6 inline-block"
          >
            Back to Subscriptions
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Complete payment
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">
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
    <div className="min-h-screen dark:bg-background-dark light:bg-background-light flex items-center justify-center px-6">
      <div className="text-center glass-panel rounded-2xl p-8">
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          This payment cannot be completed here. Please start again from Subscriptions.
        </p>
        <Link
          to="/subscriptions"
          className="text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          Back to Subscriptions
        </Link>
      </div>
    </div>
  );
}
