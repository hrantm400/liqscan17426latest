import { useState, useEffect } from 'react';
import { Copy, Share2, Check, Users, DollarSign, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { authApi } from '../services/userApi';

interface ReferralInfo {
  referralCode: string;
  referralLink: string;
  stats: {
    referredCount: number;
    pendingEarned: string;
    paidEarned: string;
  };
}

export function ReferralSection() {
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReferralInfo = async () => {
      try {
        const response = await authApi.getReferralInfo();
        setReferralInfo(response);
      } catch (error) {
        console.error('Failed to fetch referral info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReferralInfo();
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const shareLink = async () => {
    if (!referralInfo) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Liquidity Scanner',
          text: 'Check out this amazing trading tool!',
          url: referralInfo.referralLink,
        });
      } catch (error) {
        // User cancelled or error
        console.log('Share cancelled');
      }
    } else {
      // Fallback: copy link
      copyToClipboard(referralInfo.referralLink);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-8 dark:border-white/10 light:border-green-300">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-white/10 rounded w-1/3"></div>
          <div className="h-20 bg-white/10 rounded"></div>
        </div>
      </div>
    );
  }

  if (!referralInfo) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-8 dark:border-white/10 light:border-green-300"
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold dark:text-white light:text-text-dark mb-2">
          Referral Program
        </h2>
        <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">
          Earn 25% lifetime commission on every payment from users you refer
        </p>
      </div>

      {/* Referral Code & Link */}
      <div className="space-y-4 mb-8">
        <div>
          <label className="text-xs dark:text-gray-500 light:text-text-light-secondary mb-2 block">
            Your Referral Code
          </label>
          <div className="flex gap-2">
            <div className="flex-1 px-4 py-3 rounded-xl dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 border font-mono text-lg font-bold dark:text-white light:text-text-dark">
              {referralInfo.referralCode}
            </div>
            <button
              onClick={() => copyToClipboard(referralInfo.referralCode)}
              className="px-4 py-3 bg-primary/10 border border-primary/30 text-primary rounded-xl hover:bg-primary/20 transition-all"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs dark:text-gray-500 light:text-text-light-secondary mb-2 block">
            Your Referral Link
          </label>
          <div className="flex gap-2">
            <div className="flex-1 px-4 py-3 rounded-xl dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 border text-sm dark:text-white light:text-text-dark break-all">
              {referralInfo.referralLink}
            </div>
            <button
              onClick={() => copyToClipboard(referralInfo.referralLink)}
              className="px-4 py-3 bg-primary/10 border border-primary/30 text-primary rounded-xl hover:bg-primary/20 transition-all"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
            <button
              onClick={shareLink}
              className="px-4 py-3 bg-primary/10 border border-primary/30 text-primary rounded-xl hover:bg-primary/20 transition-all"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 border">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-primary" />
            <div className="text-xs dark:text-gray-500 light:text-text-light-secondary">Referred</div>
          </div>
          <div className="text-2xl font-bold dark:text-white light:text-text-dark">
            {referralInfo.stats.referredCount}
          </div>
        </div>

        <div className="p-4 rounded-xl dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <div className="text-xs dark:text-gray-500 light:text-text-light-secondary">Pending</div>
          </div>
          <div className="text-2xl font-bold dark:text-white light:text-text-dark">
            ${parseFloat(referralInfo.stats.pendingEarned).toFixed(2)}
          </div>
        </div>

        <div className="p-4 rounded-xl dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 border">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            <div className="text-xs dark:text-gray-500 light:text-text-light-secondary">Paid</div>
          </div>
          <div className="text-2xl font-bold dark:text-white light:text-text-dark">
            ${parseFloat(referralInfo.stats.paidEarned).toFixed(2)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
