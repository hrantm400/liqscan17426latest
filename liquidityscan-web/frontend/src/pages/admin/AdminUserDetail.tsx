import { useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, Lock } from 'lucide-react';
import { adminApi } from '../../services/userApi';
import { ALL_FEATURES } from '../../constants/features';

interface GranterInfo {
  id: string;
  email: string;
  name: string | null;
}

interface FeatureGrant {
  id: string;
  feature: string;
  expiresAt: string | null;
  grantedBy: string | null;
  grantedByUser?: GranterInfo | null;
  createdAt: string;
}

function formatGranterCell(g: FeatureGrant) {
  if (g.grantedByUser) {
    const n = g.grantedByUser.name?.trim();
    const em = g.grantedByUser.email;
    return n ? `${n} · ${em}` : em;
  }
  if (g.grantedBy) return `User id: ${g.grantedBy.slice(0, 8)}…`;
  return '—';
}

function formatFeatureLabel(feature: string) {
  return feature.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function isGrantActive(g: FeatureGrant) {
  if (!g.expiresAt) return true;
  return new Date(g.expiresAt) > new Date();
}

export function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [extendDays, setExtendDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'user', id],
    enabled: Boolean(id),
    queryFn: () => adminApi.getUserById(id as string),
  });

  const { data: featuresData, isLoading: featuresLoading } = useQuery({
    queryKey: ['admin', 'user', id, 'features'],
    enabled: Boolean(id),
    queryFn: () => adminApi.getUserFeatures(id as string),
  });

  const isPaidTier = Boolean(data?.tier && data.tier !== 'FREE');

  const daysRemaining = useMemo(() => {
    if (!data?.subscriptionExpiresAt) return null;
    return Math.max(
      0,
      Math.ceil((new Date(data.subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );
  }, [data?.subscriptionExpiresAt]);

  const activeStoredGrants = useMemo(() => {
    if (!featuresData?.length) return [];
    return featuresData.filter((g: FeatureGrant) => isGrantActive(g));
  }, [featuresData]);

  /** Resolved the same way as product tier logic: paid = all features; FREE = grants */
  const effectiveAccessRows = useMemo(() => {
    if (!data || featuresLoading) return null;
    const grants = (featuresData ?? []) as FeatureGrant[];
    const paid = data.tier !== 'FREE';

    return ALL_FEATURES.map((feature) => {
      if (paid) {
        return {
          feature,
          hasAccess: true,
          sourceLabel: 'Paid subscription',
          whoLine: null as string | null,
        };
      }
      const allGrant = grants.find((g) => g.feature === 'all' && isGrantActive(g));
      if (allGrant) {
        return {
          feature,
          hasAccess: true,
          sourceLabel: 'Admin grant (all features)',
          whoLine: formatGranterCell(allGrant),
        };
      }
      const grant = grants.find((g) => g.feature === feature && isGrantActive(g));
      if (grant) {
        return {
          feature,
          hasAccess: true,
          sourceLabel: 'Admin grant',
          whoLine: formatGranterCell(grant),
        };
      }
      return {
        feature,
        hasAccess: false,
        sourceLabel: '—',
        whoLine: null as string | null,
      };
    });
  }, [data, featuresData, featuresLoading]);

  const grantFeatureMutation = useMutation({
    mutationFn: async ({ feature, expiresAt }: { feature: string; expiresAt?: string | null }) => {
      return adminApi.grantFeature(id as string, feature, expiresAt);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', id, 'features'] }),
  });

  const revokeFeatureMutation = useMutation({
    mutationFn: async (feature: string) => {
      return adminApi.revokeFeature(id as string, feature);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', id, 'features'] }),
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const features = ['all', ...ALL_FEATURES] as string[];
      for (const feature of features) {
        await adminApi.revokeFeature(id as string, feature);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', id, 'features'] }),
  });

  const hasFeature = useCallback(
    (feature: string): boolean => {
      if (!featuresData) return false;
      if (
        featuresData.some(
          (g: FeatureGrant) => g.feature === 'all' && (!g.expiresAt || new Date(g.expiresAt) > new Date()),
        )
      ) {
        return true;
      }
      const grant = featuresData.find((g: FeatureGrant) => g.feature === feature);
      if (!grant) return false;
      if (!grant.expiresAt) return true;
      return new Date(grant.expiresAt) > new Date();
    },
    [featuresData],
  );

  const getExpiryDate = (feature: string): string | null => {
    if (!featuresData) return null;
    const grant = featuresData.find((g: FeatureGrant) => g.feature === feature);
    if (!grant || !grant.expiresAt) return null;
    const d = new Date(grant.expiresAt);
    return d.toISOString().split('T')[0];
  };

  const toggleFeature = (feature: string, isChecked: boolean) => {
    if (isPaidTier) return;
    if (isChecked) {
      grantFeatureMutation.mutate({ feature, expiresAt: null });
    } else {
      revokeFeatureMutation.mutate(feature);
    }
  };

  const [expiryInputs, setExpiryInputs] = useState<Record<string, string>>({});

  const setExpiry = (feature: string, date: string) => {
    if (isPaidTier) return;
    setExpiryInputs((prev) => ({ ...prev, [feature]: date }));
    if (date) {
      grantFeatureMutation.mutate({ feature, expiresAt: date });
    } else {
      grantFeatureMutation.mutate({ feature, expiresAt: null });
    }
  };

  const grantAll = () => {
    if (isPaidTier) return;
    grantFeatureMutation.mutate({ feature: 'all', expiresAt: null });
  };

  const revokeAll = () => {
    if (isPaidTier) return;
    revokeAllMutation.mutate();
  };

  const updateMutation = useMutation({
    mutationFn: (payload: any) => adminApi.updateUser(id as string, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', id] }),
  });

  const extendMutation = useMutation({
    mutationFn: () => adminApi.extendUserSubscriptionAdmin(id as string, extendDays),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', id] }),
  });

  const busy =
    grantFeatureMutation.isPending || revokeFeatureMutation.isPending || revokeAllMutation.isPending;

  if (isLoading) return <div className="text-white">Loading user...</div>;
  if (!data) return <div className="text-red-400">User not found</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">User Details</h1>
        <p className="text-gray-400" data-clarity-mask="true">
          {data.email}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Subscription</div>
        <div className="text-xl font-bold text-white">{data.tier === 'FREE' ? 'Free' : 'Full Access'}</div>
        <div className="text-sm text-gray-400 mt-1">
          Status: {data.subscriptionStatus || 'none'}
          {daysRemaining !== null ? ` · ${daysRemaining} days left` : ''}
        </div>
        {data.subscriptionExpiresAt && (
          <div className="text-sm text-gray-400">
            Expires: {new Date(data.subscriptionExpiresAt).toLocaleString()}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => updateMutation.mutate({ tier: 'PAID_MONTHLY' })}
            className="px-3 py-2 rounded bg-primary/20 text-primary text-sm font-bold"
          >
            Set Paid Monthly
          </button>
          <button
            onClick={() => updateMutation.mutate({ tier: 'PAID_ANNUAL' })}
            className="px-3 py-2 rounded bg-primary/20 text-primary text-sm font-bold"
          >
            Set Paid Annual
          </button>
          <button
            onClick={() => updateMutation.mutate({ tier: 'FREE' })}
            className="px-3 py-2 rounded bg-red-500/20 text-red-400 text-sm font-bold"
          >
            Set Free
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={extendDays}
            onChange={(e) => setExtendDays(Number(e.target.value))}
            data-clarity-mask="true"
            className="w-24 px-2 py-1 rounded bg-black/30 border border-white/10 text-white"
          />
          <button
            onClick={() => extendMutation.mutate()}
            className="px-3 py-2 rounded bg-white/10 text-white text-sm font-bold"
          >
            Extend Subscription (days)
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="text-sm font-bold text-amber-200 mb-1">Effective access</div>
        {isPaidTier ? (
          <p className="text-sm text-gray-300 leading-relaxed">
            This user has a paid tier: <span className="text-white font-semibold">all product features</span> are
            unlocked by subscription. Rows in <span className="text-cyan-300/90">feature_access</span> below are
            optional leftovers and do <span className="text-white font-medium">not</span> change tier logic until
            they are set to Free.
          </p>
        ) : (
          <p className="text-sm text-gray-300 leading-relaxed">
            Free tier: access comes from{' '}
            <span className="text-white font-semibold">{activeStoredGrants.length}</span> active admin grant
            {activeStoredGrants.length === 1 ? '' : 's'} (see table below). Use toggles to add or remove grants.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-5">
        <div className="text-lg font-bold text-white mb-1">What this user can access</div>
        <p className="text-sm text-gray-400 mb-4">
          Same rules as the app: paid tier → all features; FREE → only active admin grants. Shows who granted when
          known.
        </p>
        {featuresLoading || effectiveAccessRows === null ? (
          <div className="text-sm text-gray-400">Loading access…</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-left text-gray-400">
                  <th className="px-3 py-2 font-semibold">Feature</th>
                  <th className="px-3 py-2 font-semibold">Access</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Granted by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {effectiveAccessRows.map((row) => (
                  <tr key={row.feature} className="text-gray-300">
                    <td className="px-3 py-2 font-medium text-white">{formatFeatureLabel(row.feature)}</td>
                    <td className="px-3 py-2">
                      {row.hasAccess ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-500/15 text-gray-400 font-semibold">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{row.sourceLabel}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{row.whoLine ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-bold text-white mb-1">Stored grants (database)</div>
        <p className="text-sm text-gray-400 mb-4">Exact rows in feature_access — including &quot;all&quot;.</p>

        {featuresLoading ? (
          <div className="text-sm text-gray-400">Loading...</div>
        ) : !featuresData?.length ? (
          <div className="text-sm text-gray-500 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
            No grant rows stored for this user.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-left text-gray-400">
                  <th className="px-3 py-2 font-semibold">Feature</th>
                  <th className="px-3 py-2 font-semibold">Expires</th>
                  <th className="px-3 py-2 font-semibold">Granted by</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {featuresData.map((g: FeatureGrant) => {
                  const active = isGrantActive(g);
                  return (
                    <tr key={g.id} className="text-gray-300">
                      <td className="px-3 py-2 font-mono text-xs text-cyan-200/90">{g.feature}</td>
                      <td className="px-3 py-2">
                        {g.expiresAt ? new Date(g.expiresAt).toLocaleString() : '— (lifetime)'}
                      </td>
                      <td className="px-3 py-2 text-xs">{formatGranterCell(g)}</td>
                      <td className="px-3 py-2">{new Date(g.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          {active ? 'Active' : 'Expired'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-2 mb-2">
          <div className="text-lg font-bold text-white">Feature toggles</div>
          {isPaidTier && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/10 text-gray-300">
              <Lock className="w-3 h-3" />
              Read-only (paid tier)
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 mb-4">
          {isPaidTier
            ? 'Shown for clarity: every feature is effectively on via subscription. Switch user to Free to edit grants.'
            : 'Granular access for FREE users. Grant &quot;all&quot; or pick individual features; set optional expiry dates.'}
        </p>

        {featuresLoading ? (
          <div className="text-sm text-gray-400">Loading features...</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={grantAll}
                disabled={isPaidTier || busy}
                className="px-3 py-2 rounded bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Grant All Features
              </button>
              <button
                type="button"
                onClick={revokeAll}
                disabled={isPaidTier || busy}
                className="px-3 py-2 rounded bg-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                {revokeAllMutation.isPending ? 'Revoking…' : 'Revoke All'}
              </button>
            </div>

            <div className="space-y-2">
              {ALL_FEATURES.map((feature) => {
                const fromDb = hasFeature(feature);
                const effectiveOn = isPaidTier || fromDb;
                const expiry = getExpiryDate(feature);
                const expiryInput = expiryInputs[feature] ?? expiry ?? '';

                return (
                  <div
                    key={feature}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleFeature(feature, !fromDb)}
                        disabled={isPaidTier || busy}
                        className={`w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0 ${
                          effectiveOn
                            ? 'bg-primary text-black'
                            : 'bg-white/10 text-gray-500'
                        } ${isPaidTier ? 'opacity-90 cursor-not-allowed' : ''}`}
                      >
                        {effectiveOn ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                      <span
                        className={`text-sm font-semibold ${effectiveOn ? 'text-white' : 'text-gray-500'}`}
                      >
                        {formatFeatureLabel(feature)}
                      </span>
                      {isPaidTier && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                          Via subscription
                        </span>
                      )}
                      {!isPaidTier && fromDb && !expiry && (
                        <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">Lifetime</span>
                      )}
                      {!isPaidTier && fromDb && expiry && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            new Date(expiry) > new Date()
                              ? 'bg-yellow-500/10 text-yellow-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {new Date(expiry) > new Date() ? `Expires ${expiry}` : `Expired ${expiry}`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={expiryInput}
                        onChange={(e) => setExpiry(feature, e.target.value)}
                        disabled={isPaidTier || busy}
                        data-clarity-mask="true"
                        className="w-36 px-2 py-1 rounded text-xs bg-black/30 border border-white/10 text-white disabled:opacity-40"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-bold text-white mb-3">Payment History</div>
        <div className="space-y-2">
          {(data.payments || []).map((p: any) => (
            <div key={p.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-white text-sm font-semibold">
                ${Number(p.amount || 0).toFixed(2)} · {p.status}
              </div>
              <div className="text-xs text-gray-500">
                {p.paymentMethod || 'N/A'} · {new Date(p.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-bold text-white mb-3">Alerts</div>
        <div className="space-y-2">
          {(data.alertSubscriptions || []).map((a: any) => (
            <div key={a.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-gray-300">
              {a.symbol} · {a.strategyType} · {a.isActive ? 'active' : 'paused'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
