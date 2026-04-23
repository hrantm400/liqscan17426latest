import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { authApi, getApiBaseUrl } from '../services/userApi';

declare global {
  interface Window {
    google?: any;
  }
}

export function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, setUser, setToken, setRefreshToken } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const referralCode = searchParams.get('ref') || '';

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (user && token) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, token, navigate]);

  // Handle OAuth error surfaced by backend redirect.
  // PR 3.1 — dropped legacy `?token=` / `?refreshToken=` URL-param fallback:
  // backend has used one-time `?code=` exchange since 2024 (see OAuthHandler).
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError('Google authentication failed');
    }
  }, [searchParams]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId || token) return;

    let cancelled = false;
    const scriptId = 'google-gsi-script';

    const initOneTap = () => {
      if (cancelled || !window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (cancelled || !response?.credential) return;
          try {
            const data = await authApi.googleOneTap(response.credential);
            setUser(data.user);
            setToken(data.accessToken);
            setRefreshToken(data.refreshToken);
            navigate('/dashboard');
          } catch (err: any) {
            setError(err?.message || 'Google One Tap authentication failed');
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      window.google.accounts.id.prompt();
    };

    if (document.getElementById(scriptId)) {
      initOneTap();
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initOneTap;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // ignore
      }
    };
  }, [navigate, setRefreshToken, setToken, setUser, token]);

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const data = await authApi.register({
        name,
        email,
        password,
        referralCode: referralCode || undefined,
      });
      setUser(data.user);
      setToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${getApiBaseUrl()}/auth/google`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center dark:bg-background-dark light:bg-background-light px-4 py-8 relative overflow-hidden">
      {/* cinematic ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dark:bg-cinematic-gradient light:bg-cinematic-gradient-light opacity-90"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
      />

      {/* Back to Landing Button */}
      <a
        href="/"
        className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-2 rounded-full dark:bg-white/5 light:bg-white/80 backdrop-blur-sm dark:hover:bg-white/10 light:hover:bg-white dark:text-gray-400 light:text-text-light-secondary dark:hover:text-primary light:hover:text-primary transition-all text-xs font-bold uppercase tracking-wider border dark:border-white/10 light:border-green-300/50 hover:border-primary/30 z-10"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        <span>Landing</span>
      </a>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >

        <div className="glass-panel rounded-2xl p-8 shadow-glow-md">
          {/* Brand chip + title */}
          <div className="text-center mb-8 flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10">
              <span className="material-symbols-outlined text-primary text-[16px] drop-shadow-[0_0_6px_rgba(19,236,55,0.5)]">
                rocket_launch
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                Join the scanner
              </span>
            </span>
            <div>
              <h1 className="text-3xl font-black tracking-tight dark:text-white light:text-text-dark">
                Create your account
              </h1>
              <p className="mt-1 text-sm dark:text-gray-400 light:text-text-light-secondary">
                Free Forever to start. Upgrade any time.
              </p>
            </div>
            {referralCode && (
              <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest">
                <span className="material-symbols-outlined text-[12px]">handshake</span>
                Referred by {referralCode}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Google Login Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGoogleLogin}
            className="w-full mb-4 flex items-center justify-center gap-3 px-4 py-3 rounded-xl border dark:bg-white/[0.04] light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:hover:bg-white/[0.08] light:hover:bg-green-50 hover:border-primary/30 transition-all font-bold backdrop-blur-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </motion.button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t dark:border-white/10 light:border-green-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 dark:bg-background-dark light:bg-background-light dark:text-gray-400 light:text-text-light-secondary">
                Or sign up with email
              </span>
            </div>
          </div>

          {/* Email Register Form */}
          <form onSubmit={handleEmailRegister} className="space-y-4">
            <FormField
              label="Full Name"
              icon="person"
              type="text"
              value={name}
              onChange={setName}
              placeholder="John Doe"
              required
            />
            <FormField
              label="Email"
              icon="mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />
            <FormField
              label="Password"
              icon="lock"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
              minLength={6}
            />
            <FormField
              label="Confirm Password"
              icon="lock_reset"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="••••••••"
              required
              minLength={6}
            />

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-black font-black tracking-wide uppercase shadow-glow-md hover:shadow-glow-lg hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Creating account
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                  Create Account
                </>
              )}
            </motion.button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center text-sm">
            <span className="dark:text-gray-400 light:text-text-light-secondary">
              Already have an account?{' '}
            </span>
            <Link
              to="/login"
              className="text-primary font-bold hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  icon: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  minLength?: number;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  icon,
  type,
  value,
  onChange,
  placeholder,
  required,
  minLength,
}) => (
  <div>
    <label className="block text-[10px] font-black uppercase tracking-widest dark:text-gray-400 light:text-text-light-secondary mb-2">
      {label}
    </label>
    <div className="relative">
      <span className="absolute inset-y-0 left-3 flex items-center text-primary/70 pointer-events-none">
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        data-clarity-mask="true"
        className="w-full pl-10 pr-4 py-3 rounded-xl border dark:bg-white/[0.03] light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:placeholder:text-gray-600 light:placeholder:text-text-light-secondary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
        placeholder={placeholder}
      />
    </div>
  </div>
);
