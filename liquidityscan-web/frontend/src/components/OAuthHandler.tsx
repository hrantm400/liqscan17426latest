import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/userApi';

/**
 * OAuth callback handler.
 *
 * Since the 2024 exchange-code migration the backend redirects to
 * `/oauth-callback?code=<one-time>` (5-min TTL, single use). The frontend
 * exchanges it via POST /auth/oauth/exchange and receives tokens in the
 * response body. After PR 3.1 the refresh token is also placed in an
 * httpOnly `rt` cookie by the backend — we still store the access token
 * in Zustand via setToken so the axios-style client can use it.
 *
 * The legacy `?token=` / `?refreshToken=` URL-param fallback and the
 * `sessionStorage.oauth_token` bridge were removed in PR 3.1: the server
 * has not emitted those parameters for over a year. If a client is found
 * relying on the old flow, investigate the source — it's almost certainly
 * a spoofed URL.
 */
export function OAuthHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setToken } = useAuthStore();

  const isProcessingRef = useRef(false);
  const processedCodeRef = useRef<string | null>(null);

  const finalizeWithTokens = async (accessToken: string, userFromApi?: unknown) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      setToken(accessToken);

      if (userFromApi && typeof userFromApi === 'object') {
        setUser(userFromApi as Parameters<typeof setUser>[0]);
      } else {
        try {
          const profile = await authApi.getProfile();
          setUser(profile);
        } catch (error) {
          console.error('[OAuthHandler] Failed to fetch profile after exchange:', error);
          navigate('/login?error=profile_fetch_failed', { replace: true });
          return;
        }
      }

      const currentPath = window.location.pathname;
      if (currentPath !== '/dashboard' && !currentPath.startsWith('/dashboard')) {
        window.history.replaceState({}, '', '/dashboard');
        navigate('/dashboard', { replace: true });
      }
    } catch (error) {
      console.error('[OAuthHandler] Error processing OAuth callback:', error);
      isProcessingRef.current = false;
      navigate('/login?error=failed_to_process_oauth', { replace: true });
    }
  };

  useEffect(() => {
    const errorParam =
      new URLSearchParams(window.location.search).get('error') || searchParams.get('error');

    if (errorParam) {
      console.error('[OAuthHandler] OAuth error:', decodeURIComponent(errorParam));
      navigate(`/login?error=${encodeURIComponent(errorParam)}`, { replace: true });
      return;
    }

    const code =
      searchParams.get('code') || new URLSearchParams(window.location.search).get('code');

    if (!code) return;
    if (processedCodeRef.current === code) return;
    processedCodeRef.current = code;

    authApi
      .oauthExchangeCode(code)
      .then((res) => finalizeWithTokens(res.accessToken, res.user))
      .catch((err) => {
        console.error('[OAuthHandler] Code exchange failed:', err);
        processedCodeRef.current = null;
        navigate('/login?error=oauth_exchange_failed', { replace: true });
      });
  }, [searchParams, location.pathname, navigate, setToken, setUser]);

  return null;
}
