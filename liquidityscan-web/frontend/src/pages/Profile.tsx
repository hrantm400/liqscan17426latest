import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';
import { motion } from 'framer-motion';
import { ReferralSection } from '../components/ReferralSection';
import { TimezoneSelector } from '../components/settings/TimezoneSelector';
import { userApi } from '../services/userApi';

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
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-black dark:text-white light:text-text-dark mb-1">Profile</h1>
          <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">Account overview</p>
        </div>

        {/* Profile Card — mask PII in session recordings */}
        <div className="glass-panel rounded-2xl p-4 md:p-8" data-clarity-mask="true">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/60 ring-4 dark:ring-white/20 light:ring-green-300/50 flex items-center justify-center text-2xl font-bold text-white">
              {getInitials(profile.name, profile.email)}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold dark:text-white light:text-text-dark mb-1">
                {profile.name || profile.email?.split('@')[0] || 'User'}
              </h2>
              <p className="text-sm dark:text-gray-400 light:text-text-light-secondary mb-4">{profile.email}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl dark:bg-white/5 light:bg-green-50 border dark:border-white/10 light:border-green-300">
                  <div className="text-[10px] dark:text-gray-500 light:text-text-light-secondary uppercase tracking-wider">User ID</div>
                  <div className="text-sm font-mono dark:text-white light:text-text-dark mt-1" title={profile.id}>{profile.id.substring(0, 8)}...</div>
                </div>
                <div className="p-3 rounded-xl dark:bg-white/5 light:bg-green-50 border dark:border-white/10 light:border-green-300">
                  <div className="text-[10px] dark:text-gray-500 light:text-text-light-secondary uppercase tracking-wider">Member Since</div>
                  <div className="text-sm dark:text-white light:text-text-dark mt-1">{new Date(profile.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="p-3 rounded-xl dark:bg-white/5 light:bg-green-50 border dark:border-white/10 light:border-green-300">
                  <div className="text-[10px] dark:text-gray-500 light:text-text-light-secondary uppercase tracking-wider">Subscription</div>
                  <div className="text-sm dark:text-white light:text-text-dark mt-1">
                    {isPaid ? 'Full Access' : 'Free'}
                    {isPaid && typeof daysRemaining === 'number' ? ` · ${daysRemaining}d left` : ''}
                  </div>
                </div>
                <div className="p-3 rounded-xl dark:bg-white/5 light:bg-green-50 border dark:border-white/10 light:border-green-300">
                  <div className="text-[10px] dark:text-gray-500 light:text-text-light-secondary uppercase tracking-wider">Last Updated</div>
                  <div className="text-sm dark:text-white light:text-text-dark mt-1">{new Date(profile.updatedAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Timezone Settings */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold dark:text-white light:text-text-dark">Timezone Settings</h2>
              <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">All signal times will be displayed in this timezone</p>
            </div>
            <div className="w-full sm:w-64">
              <TimezoneSelector />
            </div>
          </div>
        </div>

        {/* Referral Section */}
        <ReferralSection />

        {/* Actions */}
        <div className="flex gap-4">
          <button onClick={() => navigate('/settings')} className="px-6 py-3 dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 border dark:text-white light:text-text-dark rounded-xl font-bold hover:dark:bg-white/10 hover:light:bg-green-100 transition-all">
            ⚙️ Settings
          </button>
          <button
            onClick={() => { logout(); navigate('/login', { replace: true }); }}
            className="px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl font-bold hover:bg-red-500/20 transition-all"
          >
            Logout
          </button>
        </div>
      </motion.div>
    </div>
  );
}
