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
    <div className="min-h-screen flex items-center justify-center dark:bg-background-dark light:bg-background-light px-4 relative">
      {/* Back to Landing Button */}
      <a
        href="/"
        className="absolute top-4 left-4 flex items-center gap-2 px-3 py-2 rounded-lg dark:bg-white/5 light:bg-green-50 dark:hover:bg-white/10 light:hover:bg-green-100 dark:text-gray-400 light:text-text-light-secondary dark:hover:text-white light:hover:text-text-dark transition-all text-sm font-medium border dark:border-white/10 light:border-green-300/50 z-10"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        <span>Back to Landing</span>
      </a>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >

        <div className="glass-panel rounded-2xl p-8">
          {/* Logo/Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black dark:text-white light:text-text-dark mb-2">
              Liquidity Scanner
            </h1>
            <p className="text-sm dark:text-gray-400 light:text-text-light-secondary">
              Sign in to your account
            </p>
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
            className="w-full mb-4 flex items-center justify-center gap-3 px-4 py-3 rounded-xl dark:bg-white/5 light:bg-green-50 dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:hover:bg-white/10 light:hover:bg-green-100 transition-all font-medium"
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
              <label className="block text-sm font-medium dark:text-gray-300 light:text-text-dark mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-clarity-mask="true"
                className="w-full px-4 py-3 rounded-xl dark:bg-white/5 light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:placeholder:text-gray-600 light:placeholder:text-text-light-secondary focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium dark:text-gray-300 light:text-text-dark mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-clarity-mask="true"
                className="w-full px-4 py-3 rounded-xl dark:bg-white/5 light:bg-white dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:placeholder:text-gray-600 light:placeholder:text-text-light-secondary focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                placeholder="••••••••"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-black font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
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
