import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';
import { motion } from 'framer-motion';
import { ReferralSection } from '../components/ReferralSection';
import { TimezoneSelector } from '../components/settings/TimezoneSelector';
import { userApi } from '../services/userApi';
import { PageHero } from '../components/shared/PageHero';

export function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<User | null>(user);
  const [loading, setLoading] = useState(!user);
  const hasFetchedRef = useRef(false);
  const isPaid = profile?.tier && profile.tier !== 'FREE';
  const daysRemaining = profile?.subscriptionExpiresAt
    ? Math.max(0, Math.ceil((new Date(profile.subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  useEffect(() => {
    if (hasFetchedRef.current) return;
    const fetchProfile = async () => {
      hasFetchedRef.current = true;
      if (user) setProfile(user);
      try {
        const freshProfile = await userApi.getProfile();
        if (freshProfile) setProfile(freshProfile);
      } catch {
        // Keep store value as fallback
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.substring(0, 2).toUpperCase();
    }
    if (email) return email.substring(0, 2).toUpperCase();
    return 'U';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div className="dark:text-white light:text-text-dark text-lg">Loading profile...</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="dark:text-white light:text-text-dark mb-4">Not logged in</div>
          <a href="/login" className="px-4 py-2 bg-primary text-black rounded-lg font-bold hover:bg-primary/90 inline-block">Go to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <PageHero
          eyebrow="Account"
          icon="account_circle"
          title="Profile"
          subtitle="Account overview, timezone, and referrals."
          tone="primary"
          unboxed
        />

        {/* Profile Card — mask PII in session recordings */}
        <div className="glass-panel rounded-2xl p-5 md:p-7 relative overflow-hidden" data-clarity-mask="true">
          <span aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-start gap-5">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/60 ring-4 dark:ring-white/10 light:ring-green-300/50 flex items-center justify-center text-2xl font-black text-white shadow-glow-md shrink-0">
              {getInitials(profile.name, profile.email)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-black dark:text-white light:text-text-dark">
                  {profile.name || profile.email?.split('@')[0] || 'User'}
                </h2>
                <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border leading-none ${
                  isPaid
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'dark:bg-white/[0.04] light:bg-slate-100 dark:text-gray-300 light:text-slate-600 dark:border-white/10 light:border-slate-200'
                }`}>
                  <span className="material-symbols-outlined text-[12px]">{isPaid ? 'workspace_premium' : 'person'}</span>
                  {isPaid ? 'Full Access' : 'Free'}
                </span>
              </div>
              <p className="mt-1 text-sm dark:text-gray-400 light:text-text-light-secondary truncate">{profile.email}</p>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <ProfileStat icon="badge" label="User ID" value={`${profile.id.substring(0, 8)}…`} mono />
                <ProfileStat icon="event" label="Member Since" value={new Date(profile.createdAt).toLocaleDateString()} />
                <ProfileStat
                  icon="workspace_premium"
                  label="Subscription"
                  value={isPaid
                    ? `Full Access${typeof daysRemaining === 'number' ? ` · ${daysRemaining}d` : ''}`
                    : 'Free'}
                  accent={isPaid ? 'primary' : undefined}
                />
                <ProfileStat icon="update" label="Last Updated" value={new Date(profile.updatedAt).toLocaleDateString()} />
              </div>
            </div>
          </div>
        </div>

        {/* Timezone Settings */}
        <div className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 border border-primary/30 text-primary shrink-0">
                <span className="material-symbols-outlined text-[18px]">schedule</span>
              </span>
              <div>
                <h2 className="text-base font-black dark:text-white light:text-text-dark">Timezone</h2>
                <p className="text-xs dark:text-gray-400 light:text-text-light-secondary">All signal times will be displayed in this timezone.</p>
              </div>
            </div>
            <div className="w-full sm:w-64">
              <TimezoneSelector />
            </div>
          </div>
        </div>

        {/* Referral Section */}
        <ReferralSection />

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border dark:bg-white/[0.04] light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark font-bold hover:border-primary/40 hover:text-primary transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">settings</span>
            Settings
          </button>
          <button
            onClick={() => { logout(); navigate('/login', { replace: true }); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-bold hover:bg-red-500/20 hover:border-red-500/50 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Logout
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const ProfileStat: React.FC<{
  icon: string;
  label: string;
  value: string;
  mono?: boolean;
  accent?: 'primary';
}> = ({ icon, label, value, mono, accent }) => (
  <div className="flex items-start gap-2 p-3 rounded-xl border dark:bg-white/[0.03] light:bg-white/70 dark:border-white/10 light:border-green-300">
    <span className={`grid h-7 w-7 place-items-center rounded-md border shrink-0 ${
      accent === 'primary'
        ? 'bg-primary/10 border-primary/30 text-primary'
        : 'dark:bg-white/[0.05] light:bg-slate-100 dark:border-white/10 light:border-slate-200 dark:text-gray-300 light:text-slate-600'
    }`}>
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
    </span>
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest dark:text-gray-500 light:text-text-light-secondary leading-none">{label}</div>
      <div className={`mt-1 text-sm font-bold leading-none truncate ${mono ? 'font-mono' : ''} ${
        accent === 'primary' ? 'text-primary' : 'dark:text-white light:text-text-dark'
      }`}>{value}</div>
    </div>
  </div>
);
