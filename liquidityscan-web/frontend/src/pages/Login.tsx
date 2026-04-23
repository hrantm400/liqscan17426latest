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

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, setUser, setToken, setRefreshToken } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    // Only redirect if we have both user and token, and user has an id
    // This prevents infinite redirects when token exists but user is not yet loaded
    // Also check that we're not already on dashboard to prevent loops
    if (token && user && user.id && window.location.pathname !== '/dashboard') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, token, navigate]);

  // Display error from OAuth if present (handled by OAuthHandler)
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam) || 'Google authentication failed');
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

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authApi.login({ email, password });
      setUser(data.user);
      setToken(data.accessToken);
      setRefreshToken(data.refreshToken);

      // Fetch fresh profile to ensure isAdmin is up to date
      try {
        const profile = await authApi.getProfile();
        setUser(profile);
      } catch (profileError) {
        console.error('Failed to fetch profile after login:', profileError);
        // Continue anyway, user data from login should be sufficient
      }

      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${getApiBaseUrl()}/auth/google`;
  };



  return (
    <div className="min-h-screen flex items-center justify-center dark:bg-background-dark light:bg-background-light px-4 py-8 relative overflow-hidden">
      {/* cinematic ambient background — primary brand glow + grid */}
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
                bolt
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                Liquidity Scanner
              </span>
            </span>
            <div>
              <h1 className="text-3xl font-black tracking-tight dark:text-white light:text-text-dark">
                Welcome back
              </h1>
              <p className="mt-1 text-sm dark:text-gray-400 light:text-text-light-secondary">
                Sign in to continue scanning the markets
              </p>
            </div>
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
                Or continue with email
              </span>
            </div>
          </div>

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest dark:text-gray-400 light:text-text-light-secondary mb-2">
                Email
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-primary/70 pointer-events-none">
                  <span className="material-symbols-outlined text-[18px]">mail</span>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-clarity-mask="true"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border dark:bg-white/[0.03] light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:placeholder:text-gray-600 light:placeholder:text-text-light-secondary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest dark:text-gray-400 light:text-text-light-secondary mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-primary/70 pointer-events-none">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-clarity-mask="true"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border dark:bg-white/[0.03] light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:placeholder:text-gray-600 light:placeholder:text-text-light-secondary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

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
                  Signing in
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  Sign In
                </>
              )}
            </motion.button>
          </form>

          {/* Register Link */}
          <div className="mt-6 text-center text-sm">
            <span className="dark:text-gray-400 light:text-text-light-secondary">
              Don't have an account?{' '}
            </span>
            <Link
              to="/register"
              className="text-primary font-medium hover:underline"
            >
              Sign up
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
