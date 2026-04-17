import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/userApi';

/**
 * OAuth callback: prefers one-time `code` (exchanged via POST /auth/oauth/exchange),
 * falls back to legacy `token` + `refreshToken` query params.
 */
export function OAuthHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setToken, setRefreshToken } = useAuthStore();

  const isProcessingRef = useRef(false);
  const processedKeyRef = useRef<string | null>(null);

  const finalizeWithTokens = async (urlToken: string, urlRefreshToken: string, userFromApi?: unknown) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      setToken(urlToken);
      setRefreshToken(urlRefreshToken);

      if (userFromApi && typeof userFromApi === 'object') {
        setUser(userFromApi as Parameters<typeof setUser>[0]);
      } else {
        try {
          const profile = await authApi.getProfile();
          setUser(profile);
        } catch (error) {
          console.error('[OAuthHandler] Failed to fetch profile, using token payload:', error);
          try {
            const payload = JSON.parse(atob(urlToken.split('.')[1]));
            setUser({
              id: payload.sub || '',
              email: payload.email || '',
              name: payload.email?.split('@')[0] || 'User',
              isAdmin: payload.isAdmin || false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          } catch (e) {
            console.error('[OAuthHandler] Failed to decode token:', e);
          }
        }
      }

      sessionStorage.removeItem('oauth_token');
      sessionStorage.removeItem('oauth_refreshToken');

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

    if (code) {
      if (processedKeyRef.current === `code:${code}`) return;
      processedKeyRef.current = `code:${code}`;

      authApi
        .oauthExchangeCode(code)
        .then((res) => finalizeWithTokens(res.accessToken, res.refreshToken, res.user))
        .catch((err) => {
          console.error('[OAuthHandler] Code exchange failed:', err);
          processedKeyRef.current = null;
          navigate('/login?error=oauth_exchange_failed', { replace: true });
        });
      return;
    }

    let urlToken: string | null = sessionStorage.getItem('oauth_token');
    let urlRefreshToken: string | null = sessionStorage.getItem('oauth_refreshToken');
    const fullUrl = window.location.href;
    const urlMatch = fullUrl.match(/\?([^#]+)/);

    if (!urlToken || !urlRefreshToken) {
      if (urlMatch) {
        const urlParams = new URLSearchParams(urlMatch[1]);
        urlToken = urlParams.get('token') || urlToken;
        urlRefreshToken = urlParams.get('refreshToken') || urlRefreshToken;
      }
      if (!urlToken) {
        const q = new URLSearchParams(window.location.search);
        urlToken = q.get('token') || searchParams.get('token');
        urlRefreshToken = q.get('refreshToken') || searchParams.get('refreshToken');
      }
    }

    if (!urlToken || !urlRefreshToken) {
      return;
    }

    if (processedKeyRef.current === `tok:${urlToken}`) return;
    processedKeyRef.current = `tok:${urlToken}`;

    finalizeWithTokens(urlToken, urlRefreshToken);
  }, [searchParams, location.pathname, navigate, setToken, setRefreshToken, setUser]);

  return null;
}


