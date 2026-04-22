import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminApi } from '../../services/userApi';
import type { AdminCoreLayerStatsResponse } from '../../services/userApi';

/**
 * Phase 5b — Core-Layer control card for the admin settings page.
 *
 * Three operations:
 *   - toggle the runtime flag (POST /admin/core-layer/enabled)
 *   - force a rescan (POST /admin/core-layer/force-rescan) behind a
 *     confirmation modal — the operation wipes ACTIVE rows and
 *     rebuilds them synchronously
 *   - display live stats (GET /admin/core-layer/stats), polled on a
 *     10-second interval while the card is mounted
 *
 * Implementation notes:
 *   - The flag toggle is optimistic-free: we wait for the mutation
 *     response before showing the new state so the UI never lies
 *     about AppConfig's current value.
 *   - The recent-errors section is collapsed by default because the
 *     common case is an empty ring buffer. A non-zero consecutive-
 *     failure count auto-expands it so an admin sees the latest
 *     failure without digging.
 *   - No routing — the card is just a sibling of the other cards on
 *     AdminSettings.tsx.
 */
export function CoreLayerAdminCard() {
    const queryClient = useQueryClient();
    const [showConfirm, setShowConfirm] = useState(false);
    const [errorsExpandedOverride, setErrorsExpandedOverride] = useState<boolean | null>(
        null,
    );

    const statsQuery = useQuery<AdminCoreLayerStatsResponse>({
        queryKey: ['admin', 'core-layer', 'stats'],
        queryFn: () => adminApi.getAdminCoreLayerStats(),
        refetchInterval: 10_000,
        refetchIntervalInBackground: false,
    });

    const toggleMutation = useMutation({
        mutationFn: (enabled: boolean) => adminApi.setAdminCoreLayerEnabled(enabled),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'core-layer', 'stats'] });
            toast.success(
                res.previousEnabled === res.enabled
                    ? `Core-Layer is ${res.enabled ? 'enabled' : 'disabled'}`
                    : `Core-Layer ${res.previousEnabled ? 'enabled' : 'disabled'} → ${res.enabled ? 'enabled' : 'disabled'}`,
            );
        },
        onError: (e: Error) => toast.error(e.message || 'Toggle failed'),
    });

    const rescanMutation = useMutation({
        mutationFn: () => adminApi.forceAdminCoreLayerRescan(),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'core-layer', 'stats'] });
            setShowConfirm(false);
            toast.success(
                `Rescan complete: wiped ${res.wiped}, created ${res.detection.created} in ${res.elapsedMs}ms`,
            );
        },
        onError: (e: Error) => {
            setShowConfirm(false);
            toast.error(e.message || 'Force-rescan failed');
        },
    });

    const runtime = statsQuery.data?.runtime;
    const counts = statsQuery.data?.activeSignalCount;
    const hasFailures = (runtime?.consecutiveFailures ?? 0) > 0;
    const errorsExpanded =
        errorsExpandedOverride !== null ? errorsExpandedOverride : hasFailures;

    const lastSuccessText = useMemo(() => {
        if (!runtime?.lastSuccessfulTickAt) return 'never';
        return formatRelative(runtime.lastSuccessfulTickAt);
    }, [runtime?.lastSuccessfulTickAt]);

    return (
        <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                    <div className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500">
                        Core-Layer controls
                    </div>
                    <p className="text-sm dark:text-gray-400 light:text-slate-600 mt-2 max-w-xl">
                        Runtime toggle for the Core-Layer alignment feature. Flipping off
                        halts hourly detection at the start of the next tick — an
                        in-flight scan completes first. Force-rescan wipes ACTIVE rows
                        and rebuilds them from the latest upstream signals; CLOSED
                        history is preserved.
                    </p>
                </div>
                <StatusPill
                    enabled={Boolean(runtime?.enabled)}
                    loading={statsQuery.isLoading}
                    unknown={!runtime && !statsQuery.isLoading}
                />
            </div>

            {statsQuery.isError && (
                <div className="text-sm text-red-400 mb-3">
                    Failed to load stats: {(statsQuery.error as Error)?.message ?? 'unknown'}
                </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer select-none mb-4">
                <input
                    type="checkbox"
                    className="w-5 h-5 rounded border dark:border-white/20 light:border-slate-300 accent-primary"
                    checked={Boolean(runtime?.enabled)}
                    // Disable the toggle when stats is loading OR in error.
                    // Otherwise an unchecked box during a failed stats fetch
                    // would misrepresent the true AppConfig state (e.g. a
                    // 429 would make the UI look DISABLED while detection
                    // is in fact running), and a click would send the
                    // opposite value to the server.
                    disabled={
                        toggleMutation.isPending ||
                        statsQuery.isLoading ||
                        statsQuery.isError ||
                        !runtime
                    }
                    onChange={(e) => toggleMutation.mutate(e.target.checked)}
                />
                <span className="dark:text-white light:text-text-dark font-semibold">
                    Core-Layer detection enabled
                </span>
                {runtime && runtime.enabled !== runtime.envSeed && (
                    <span className="text-xs dark:text-amber-300 light:text-amber-600">
                        (admin override — env seed was {runtime.envSeed ? 'on' : 'off'})
                    </span>
                )}
            </label>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat label="Total active" value={counts?.total ?? '—'} />
                <Stat label="Last tick #" value={runtime?.lastTickNumber ?? '—'} />
                <Stat label="Last success" value={lastSuccessText} />
                <Stat
                    label="Consecutive failures"
                    value={runtime?.consecutiveFailures ?? '—'}
                    emphasis={hasFailures ? 'warn' : undefined}
                />
            </div>

            {counts && counts.total > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                    <VariantBreakdown label="SE" value={counts.byVariant.SE} />
                    <VariantBreakdown label="CRT" value={counts.byVariant.CRT} />
                    <VariantBreakdown label="BIAS" value={counts.byVariant.BIAS} />
                </div>
            )}

            <div className="flex flex-wrap gap-3 items-center mb-2">
                <button
                    className="px-4 py-2 rounded-xl bg-amber-500/80 hover:bg-amber-500 text-black font-bold disabled:opacity-50"
                    disabled={
                        !runtime?.enabled || rescanMutation.isPending || statsQuery.isLoading
                    }
                    onClick={() => setShowConfirm(true)}
                    title={
                        !runtime?.enabled
                            ? 'Enable Core-Layer first'
                            : 'Wipe ACTIVE rows and rebuild from live upstream signals'
                    }
                >
                    {rescanMutation.isPending ? 'Rescanning…' : 'Force Rescan'}
                </button>
                <span className="text-xs dark:text-gray-500 light:text-slate-500">
                    Last tick duration:{' '}
                    {runtime?.lastTickDurationMs != null
                        ? `${runtime.lastTickDurationMs}ms`
                        : '—'}
                </span>
            </div>

            <div>
                <button
                    type="button"
                    className="text-xs dark:text-gray-400 light:text-slate-500 hover:underline"
                    onClick={() => setErrorsExpandedOverride(!errorsExpanded)}
                >
                    {errorsExpanded ? '▼' : '▶'} Recent errors (
                    {runtime?.recentErrors?.length ?? 0})
                </button>
                {errorsExpanded && (
                    <div className="mt-2 space-y-1 max-h-64 overflow-auto text-xs font-mono dark:text-gray-300 light:text-slate-700">
                        {runtime?.recentErrors?.length ? (
                            runtime.recentErrors.map((err, i) => (
                                <div
                                    key={`${err.at}-${i}`}
                                    className="border-l-2 border-red-500/60 pl-2 py-1"
                                >
                                    <div className="dark:text-gray-400 light:text-slate-500">
                                        tick #{err.tickNumber} · {new Date(err.at).toISOString()}
                                    </div>
                                    <div className="break-words">{err.message}</div>
                                </div>
                            ))
                        ) : (
                            <div className="dark:text-gray-500 light:text-slate-400">
                                No recent errors.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showConfirm && (
                <ConfirmRescanDialog
                    wipedEstimate={counts?.total ?? 0}
                    busy={rescanMutation.isPending}
                    onCancel={() => setShowConfirm(false)}
                    onConfirm={() => rescanMutation.mutate()}
                />
            )}
        </div>
    );
}

function StatusPill({
    enabled,
    loading,
    unknown,
}: {
    enabled: boolean;
    loading: boolean;
    unknown: boolean;
}) {
    if (loading) {
        return (
            <span className="text-xs px-2 py-1 rounded-full bg-slate-500/20 text-slate-300">
                Loading…
            </span>
        );
    }
    // Distinct UNKNOWN state when stats failed to load — avoids claiming
    // DISABLED when we actually just couldn't reach the endpoint.
    if (unknown) {
        return (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300">
                UNKNOWN
            </span>
        );
    }
    return (
        <span
            className={
                enabled
                    ? 'text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300'
                    : 'text-xs px-2 py-1 rounded-full bg-slate-500/20 text-slate-300'
            }
        >
            {enabled ? 'ENABLED' : 'DISABLED'}
        </span>
    );
}

function Stat({
    label,
    value,
    emphasis,
}: {
    label: string;
    value: string | number;
    emphasis?: 'warn';
}) {
    const valueClass =
        emphasis === 'warn'
            ? 'text-red-400 font-bold'
            : 'dark:text-white light:text-text-dark font-bold';
    return (
        <div className="rounded-xl border dark:border-white/10 light:border-green-200 p-3">
            <div className="text-[10px] uppercase tracking-widest dark:text-gray-500 light:text-slate-500">
                {label}
            </div>
            <div className={`text-lg mt-1 ${valueClass}`}>{value}</div>
        </div>
    );
}

function VariantBreakdown({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between rounded-lg border dark:border-white/10 light:border-green-200 px-3 py-2">
            <span className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500">
                {label}
            </span>
            <span className="dark:text-white light:text-text-dark font-bold">{value}</span>
        </div>
    );
}

function ConfirmRescanDialog({
    wipedEstimate,
    busy,
    onCancel,
    onConfirm,
}: {
    wipedEstimate: number;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="max-w-md w-full rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-slate-900 light:bg-white p-5">
                <div className="text-lg font-bold dark:text-white light:text-text-dark mb-2">
                    Force rescan Core-Layer?
                </div>
                <p className="text-sm dark:text-gray-400 light:text-slate-600 mb-4">
                    This will wipe approximately <span className="font-bold">{wipedEstimate}</span>{' '}
                    ACTIVE row(s) and immediately rebuild them from the latest upstream
                    signals. CLOSED history is preserved. The rebuilt rows will have no
                    prior timeline (only a fresh "created" event).
                </p>
                <div className="flex gap-2 justify-end">
                    <button
                        className="px-4 py-2 rounded-xl border dark:border-white/10 light:border-green-300 dark:text-gray-300 light:text-slate-700"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold disabled:opacity-50"
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {busy ? 'Rescanning…' : 'Yes, rescan now'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function formatRelative(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 0) return 'in the future';
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}
