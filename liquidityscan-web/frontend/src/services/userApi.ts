// Determine API URL based on environment
// If running through Cloudflare Tunnel, use relative path (proxied through Vite)
// Otherwise use explicit URL
export const getApiBaseUrl = () => {
  // Check if VITE_API_URL is explicitly set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Production build or same-origin: use relative /api (Nginx proxies to backend)
  if (import.meta.env.PROD || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
    return '/api';
  }

  // Local development: backend usually on 3000 or 3002
  return 'http://localhost:3002/api';
};

/**
 * PR 3.1 — In-memory access token.
 *
 * Access token lives ONLY in this module's closure. It is not in localStorage,
 * not in sessionStorage, not in Zustand persist. It is rebuilt on every page
 * load via `bootstrapAuth()`, which hits POST /auth/refresh — the refresh
 * token is an httpOnly `rt` cookie the browser attaches automatically.
 */
let inMemoryAccessToken: string | null = null;

export function setInMemoryAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getInMemoryAccessToken(): string | null {
  return inMemoryAccessToken;
}

/**
 * Legacy alias kept so `signalsApi.ts` / `candles.ts` callers don't need to
 * change. Always reads the in-memory token now.
 */
export function getStoredAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function apiBaseUrl(): string {
  return API_BASE_URL;
}

/**
 * Silent refresh on app boot. Call before first protected render.
 * Resolves to true if the cookie produced a fresh access token; false if
 * there is no valid session (caller should redirect to /login).
 */
export async function bootstrapAuth(): Promise<boolean> {
  try {
    const resp = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // Empty body — backend reads cookie. Content-Type header is required
      // so Nest's JSON body parser doesn't treat the body as malformed.
      body: '{}',
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (!data?.accessToken) return false;
    inMemoryAccessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

const API_BASE_URL = getApiBaseUrl();

class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private refreshInFlight: Promise<{ accessToken: string } | null> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.getToken = () => inMemoryAccessToken;
  }

  private async refreshAccessToken(): Promise<{ accessToken: string } | null> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const resp = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!data?.accessToken) return null;
        inMemoryAccessToken = data.accessToken;
        return { accessToken: data.accessToken };
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  , _retried = false): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      // Attempt token refresh once on 401
      if (response.status === 401 && !_retried) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed?.accessToken) {
          return this.request<T>(endpoint, options, true);
        }
        // Refresh failed → clear auth to stop repeated 401 spam
        try {
          // Lazy import to avoid circular deps in module init
          const mod = await import('../store/authStore');
          await mod.useAuthStore.getState().logout();
        } catch {
          inMemoryAccessToken = null;
        }
        const err = new Error('Session expired — please log in again.');
        (err as any).name = 'AuthExpiredError';
        throw err;
      }

      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
      }
      console.error('[ApiClient] Request failed:', {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        headers: Object.fromEntries(response.headers.entries()),
      });

      // For 403 errors, provide more specific message
      if (response.status === 403) {
        throw new Error(errorData.message || 'Access forbidden. Please check if you are logged in as admin and your email is in ADMIN_EMAILS list.');
      }

      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    const raw = await response.text();
    const trimmed = raw.trim();
    if (!trimmed) {
      return null as T;
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      throw new Error('Invalid JSON response from server');
    }
  }

  // Auth
  async register(data: { email: string; password: string; name?: string; referralCode?: string }) {
    return this.request<{ user: any; accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: { email: string; password: string }) {
    return this.request<{ user: any; accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async googleOneTap(credential: string) {
    return this.request<{ user: any; accessToken: string; refreshToken: string }>('/auth/google/one-tap', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
  }

  async oauthExchangeCode(code: string) {
    return this.request<{ user: any; accessToken: string; refreshToken: string }>('/auth/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async getProfile() {
    return this.request<any>('/auth/me');
  }

  async updateProfile(data: { name?: string; avatar?: string; timezone?: string }) {
    return this.request<any>('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * PR 3.1: refresh token is read from the httpOnly `rt` cookie by the
   * backend. The `refreshToken` param is ignored — retained only so existing
   * call sites (Login/Register flows that still pass it) keep compiling until
   * they are updated in this PR. Callers should prefer `bootstrapAuth()`.
   */
  async refreshToken(_refreshToken?: string) {
    return this.request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: '{}',
    });
  }



  // Payments
  async createPayment(amount: number, currency?: string, subscriptionId?: string, metadata?: any) {
    return this.request<any>('/payments/create', {
      method: 'POST',
      body: JSON.stringify({ amount, currency, subscriptionId, metadata }),
    });
  }

  async startPayment(network: string): Promise<{
    paymentId: string;
    amount: number;
    walletAddress: string;
    expiresAt: string;
    isFirstMonth?: boolean;
    basePrice?: number;
    currency?: string;
    network?: string;
  }> {
    return this.request<any>('/payments/start', {
      method: 'POST',
      body: JSON.stringify({ network }),
    });
  }

  // Backward compatibility
  async startCustomPaymentSession(network: string, _plan_type?: string) {
    return this.startPayment(network);
  }

  async getCustomSessionStatus() {
    return this.request<any>('/payments/session-status');
  }

  async createSubscriptionPayment(subscriptionId: string) {
    return this.request<any>(`/payments/subscription/${subscriptionId}`, {
      method: 'POST',
    });
  }

  async getPaymentStatus(paymentId: string) {
    return this.request<any>(`/payments/status/${paymentId}`);
  }

  // Admin
  async getAnalytics() {
    return this.request<any>('/admin/analytics');
  }

  async getAdminDashboard() {
    return this.request<any>('/admin/dashboard');
  }

  /** Runs one full basic-strategies scan (same as POST /signals/scan). Requires JWT; admin UI only in practice. */
  async triggerSignalsScan() {
    return this.request<{ status: string; message?: string }>('/signals/scan', {
      method: 'POST',
    });
  }

  async getUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    /** Filter by active FeatureAccess rows: active = has ≥1, none = none active */
    grants?: 'active' | 'none' | 'all';
  }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.grants && params.grants !== 'all') {
      queryParams.append('grants', params.grants);
    }

    return this.request<{
      data: Array<{
        activeFeatureGrantCount?: number;
        [key: string]: unknown;
      }>;
      total: number;
      page: number;
      pageCount: number;
    }>(`/admin/users?${queryParams.toString()}`);
  }

  async updateUser(id: string, data: { name?: string; isAdmin?: boolean; tier?: string }) {
    return this.request<any>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getUserById(id: string) {
    return this.request<any>(`/admin/users/${id}`);
  }

  async deleteUser(id: string) {
    return this.request<void>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  async getCategoriesAdmin() {
    return this.request<any[]>('/admin/categories');
  }

  async createCategory(data: { name: string; slug: string; description?: string; icon?: string; order?: number }) {
    return this.request<any>('/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCategory(id: string, data: { name?: string; slug?: string; description?: string; icon?: string; order?: number }) {
    return this.request<any>(`/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCategory(id: string) {
    return this.request<void>(`/admin/categories/${id}`, {
      method: 'DELETE',
    });
  }


  async getPaymentsAdmin(params?: {
    page?: number;
    limit?: number;
    status?: string;
    userId?: string;
    network?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.userId) queryParams.append('userId', params.userId);
    if (params?.network) queryParams.append('network', params.network);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.dateFrom) queryParams.append('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.append('dateTo', params.dateTo);

    return this.request<{ data: any[]; total: number; page: number; pageCount: number }>(
      `/admin/payments?${queryParams.toString()}`
    );
  }

  async getPayments(params?: {
    page?: number;
    limit?: number;
    status?: string;
    userId?: string;
    network?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    return this.getPaymentsAdmin(params);
  }

  async confirmPaymentAdmin(paymentId: string) {
    return this.request<any>(`/admin/payments/${paymentId}/confirm`, { method: 'PUT' });
  }

  async cancelPaymentAdmin(paymentId: string) {
    return this.request<any>(`/admin/payments/${paymentId}/cancel`, { method: 'PUT' });
  }

  async setUserSubscriptionAdmin(userId: string, data: { tier: string; expiresAt?: string | null; status?: string }) {
    return this.request<any>(`/admin/users/${userId}/subscription`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async extendUserSubscriptionAdmin(userId: string, days: number) {
    return this.request<any>(`/admin/users/${userId}/extend`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    });
  }

  async getEmailLogsAdmin(params?: { page?: number; limit?: number; status?: string; search?: string; dateFrom?: string; dateTo?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.dateFrom) queryParams.append('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.append('dateTo', params.dateTo);
    return this.request<any>(`/admin/email-logs?${queryParams.toString()}`);
  }

  async broadcastAdmin(data: { subject: string; body: string; channel: 'email' | 'telegram' | 'both'; filter: 'all' | 'free' | 'paid' }) {
    return this.request<any>('/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAdminSettings() {
    return this.request<any>('/admin/settings');
  }

  async patchAdminLaunchPromo(enabled: boolean) {
    return this.request<{ launchPromoFullAccess: boolean }>('/admin/settings/launch-promo', {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  }

  async patchAdminCisdConfig(data: { cisdPivotLeft: number; cisdPivotRight: number; cisdMinConsecutive: number }) {
    return this.request<any>('/admin/settings/cisd-config', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async testAdminSmtp(to?: string) {
    return this.request<any>('/admin/settings/test-smtp', {
      method: 'POST',
      body: JSON.stringify({ to }),
    });
  }

  // Courses
  async getCourses() {
    return this.request<any[]>('/courses');
  }

  async getCourse(id: string) {
    return this.request<any>(`/courses/${id}`);
  }

  async createCourse(data: any) {
    return this.request<any>('/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCourse(courseId: string, data: { title?: string; description?: string; coverUrl?: string; difficulty?: string }) {
    return this.request<any>(`/courses/${courseId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getChapters(courseId: string) {
    return this.request<any[]>(`/courses/${courseId}/chapters`);
  }

  async createChapter(courseId: string, data: any) {
    return this.request<any>(`/courses/${courseId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateChapter(id: string, data: any) {
    return this.request<any>(`/courses/chapters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteChapter(id: string) {
    return this.request<void>(`/courses/chapters/${id}`, {
      method: 'DELETE',
    });
  }

  async createLesson(chapterId: string, data: any) {
    return this.request<any>(`/courses/chapters/${chapterId}/lessons`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLesson(lessonId: string, data: { title?: string; description?: string; videoUrl?: string; videoProvider?: string; order?: number }) {
    return this.request<any>(`/courses/lessons/${lessonId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLesson(lessonId: string) {
    return this.request<void>(`/courses/lessons/${lessonId}`, {
      method: 'DELETE',
    });
  }

  async deleteCourse(id: string) {
    return this.request<void>(`/courses/${id}`, {
      method: 'DELETE',
    });
  }

  // Subscriptions
  async getSubscriptions() {
    return this.request<any[]>('/subscriptions');
  }

  async getSubscription(id: string) {
    return this.request<any>(`/subscriptions/${id}`);
  }

  async getMySubscription() {
    return this.request<any>('/subscriptions/user/me');
  }

  async subscribeToPlan(subscriptionId: string) {
    return this.request<any>(`/subscriptions/${subscriptionId}/subscribe`, {
      method: 'POST',
    });
  }

  async cancelSubscription() {
    // This will be implemented later - for now just update user subscription status
    return this.request<any>('/subscriptions/user/me', {
      method: 'DELETE',
    });
  }




  // Admin Subscriptions
  async createSubscription(data: any) {
    return this.request<any>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSubscription(id: string, data: any) {
    return this.request<any>(`/subscriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSubscription(id: string) {
    return this.request<void>(`/subscriptions/${id}`, {
      method: 'DELETE',
    });
  }

  async getSubscriptionsStats() {
    return this.request<any>('/subscriptions/stats');
  }

  // Alerts — Telegram link/unlink live under /users/me/telegram/* (reliable vs /alerts/telegram-* 404s on some deployments)
  async getTelegramId() {
    return this.request<{ telegramId: string | null }>('/users/me/telegram');
  }

  /** Returns t.me deep link; open in browser/Telegram app then press Start in the bot. */
  async createTelegramLink() {
    return this.request<{ openUrl: string; expiresInMinutes: number }>('/users/me/telegram/link', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async saveTelegramId(telegramId: string) {
    return this.request<any>('/users/me/telegram', {
      method: 'POST',
      body: JSON.stringify({ telegramId }),
    });
  }

  async disconnectTelegram() {
    return this.request<{ success: boolean }>('/users/me/telegram/unlink', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async getAlerts() {
    return this.request<any[]>('/alerts');
  }

  async getAlertStrategyOptions() {
    return this.request<{
      strategies: Array<{
        value: string;
        label: string;
        icon: string;
        color: string;
        desc: string;
        allowedTimeframes: string[];
      }>;
    }>('/users/me/alert-strategy-options');
  }

  async createAlert(symbol: string, strategyType: string, timeframes?: string[], directions?: string[]) {
    return this.request<any>('/alerts', {
      method: 'POST',
      body: JSON.stringify({ symbol, strategyType, timeframes, directions }),
    });
  }

  async updateAlert(id: string, data: { timeframes?: string[]; directions?: string[]; isActive?: boolean }) {
    return this.request<any>(`/alerts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAlert(id: string) {
    return this.request<void>(`/alerts/${id}`, {
      method: 'DELETE',
    });
  }

  /** Public, no auth required — launch promo flag for top banner. */
  async getPublicSiteStatus() {
    return this.request<{ 
      launchPromoFullAccess: boolean;
      cisdPivotLeft: number;
      cisdPivotRight: number;
      cisdMinConsecutive: number;
    }>('/public/site-status');
  }

  // Pricing / Tier
  async getTier() {
    return this.request<any>('/pricing/tier');
  }

  // Affiliate
  async getAffiliateStats() {
    return this.request<any>('/affiliate/stats');
  }

  async createAffiliate(code?: string) {
    return this.request<any>('/affiliate/create', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async validateAffiliateCode(code: string) {
    return this.request<any>(`/affiliate/validate/${code}`);
  }

  // Admin Feature Access
  async getUserFeatures(userId: string) {
    return this.request<any[]>(`/admin/users/${userId}/features`);
  }

  async grantFeature(userId: string, feature: string, expiresAt?: string | null) {
    return this.request<any>(`/admin/users/${userId}/features`, {
      method: 'POST',
      body: JSON.stringify({ feature, expiresAt }),
    });
  }

  async revokeFeature(userId: string, feature: string) {
    return this.request<void>(`/admin/users/${userId}/features/${feature}`, {
      method: 'DELETE',
    });
  }

  async getReferralInfo() {
    return this.request<any>('/affiliate/me');
  }
}

export const userApi = new ApiClient(API_BASE_URL);

// Export for backward compatibility
export const adminApi = userApi;
export const authApi = userApi;
