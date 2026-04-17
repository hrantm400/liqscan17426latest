import { useMutation, useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, Users, UserCheck, UserX, UserPlus, Activity, Radar } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { adminApi } from '../../services/userApi';

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => adminApi.getAdminDashboard(),
  });

  const scanMutation = useMutation({
    mutationFn: () => adminApi.triggerSignalsScan(),
    onSuccess: (res) => {
      if (res?.status === 'skipped') {
        toast(res.message || 'Scan skipped: market scanner disabled', { icon: '⏸️' });
        return;
      }
      toast.success(res?.status === 'Scan completed' ? 'Market scan completed' : String(res?.status || 'Done'));
    },
    onError: (e: Error) => {
      toast.error(e?.message || 'Scan failed');
    },
  });

  const stats = data?.stats || {};
  const chartRows = data?.monthlyRevenue || [];
  const maxRevenue = Math.max(...chartRows.map((r: any) => Number(r.revenue || 0)), 1);

  const cards = [
    { label: 'Total Revenue', value: `$${Number(stats.totalRevenue || 0).toFixed(2)}`, icon: DollarSign },
    { label: 'MRR', value: `$${Number(stats.mrr || 0).toFixed(2)}`, icon: TrendingUp },
    { label: 'Active Subscribers', value: stats.activeSubscribers || 0, icon: UserCheck },
    { label: 'Free Users', value: stats.freeUsers || 0, icon: UserX },
    { label: 'Total Users', value: stats.totalUsers || 0, icon: Users },
    { label: 'New Users (Month)', value: stats.newUsersThisMonth || 0, icon: UserPlus },
    { label: 'Churn (Month)', value: stats.churnThisMonth || 0, icon: Activity },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-4xl font-black dark:text-white light:text-text-dark mb-2">Admin Dashboard</h1>
            <p className="dark:text-gray-400 light:text-slate-500">Revenue, subscribers, churn, and recent activity</p>
          </div>
          <button
            type="button"
            disabled={scanMutation.isPending}
            onClick={() => scanMutation.mutate()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/15 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/25 disabled:opacity-50 disabled:pointer-events-none shrink-0"
          >
            <Radar className={`w-4 h-4 ${scanMutation.isPending ? 'animate-pulse' : ''}`} />
            {scanMutation.isPending ? 'Scanning…' : 'Run market scan'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5 animate-pulse">
              <div className="h-3 w-28 dark:bg-white/10 light:bg-slate-200 rounded mb-3" />
              <div className="h-8 w-20 dark:bg-white/10 light:bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-black dark:text-white light:text-text-dark mb-2">Admin Dashboard</h1>
          <p className="dark:text-gray-400 light:text-slate-500">Revenue, subscribers, churn, and recent activity</p>
        </div>
        <button
          type="button"
          disabled={scanMutation.isPending}
          onClick={() => scanMutation.mutate()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/15 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/25 disabled:opacity-50 disabled:pointer-events-none shrink-0"
        >
          <Radar className={`w-4 h-4 ${scanMutation.isPending ? 'animate-pulse' : ''}`} />
          {scanMutation.isPending ? 'Scanning…' : 'Run market scan'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500">{card.label}</span>
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="text-3xl font-black dark:text-white light:text-text-dark">{card.value}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
        <h2 className="text-lg font-bold dark:text-white light:text-text-dark mb-4">Revenue by Month (12m)</h2>
        {chartRows.length === 0 ? (
          <p className="text-sm dark:text-gray-400 light:text-slate-500">No revenue data yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {chartRows.map((row: any) => {
              const revenue = Number(row.revenue || 0);
              const height = Math.max(10, Math.round((revenue / maxRevenue) * 120));
              return (
                <div key={row.month} className="rounded-xl border dark:border-white/10 light:border-green-300 dark:bg-black/30 light:bg-green-50 p-3">
                  <div className="h-32 flex items-end">
                    <div className="w-full bg-primary/70 rounded-md" style={{ height }} />
                  </div>
                  <div className="text-xs dark:text-gray-400 light:text-slate-500 mt-2">{row.month}</div>
                  <div className="text-sm font-bold dark:text-white light:text-text-dark">${revenue.toFixed(2)}</div>
                  <div className="text-[11px] dark:text-gray-500 light:text-slate-500">{row.subscribers} payments</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
          <h2 className="text-lg font-bold dark:text-white light:text-text-dark mb-4">Recent Payments</h2>
          {(data?.recentPayments || []).length === 0 ? (
            <p className="text-sm dark:text-gray-400 light:text-slate-500">No recent payments.</p>
          ) : (
            <div className="space-y-2">
              {(data?.recentPayments || []).map((p: any) => (
                <div key={p.id} className="rounded-lg border dark:border-white/10 light:border-green-300 dark:bg-black/20 light:bg-green-50 p-3">
                  <div className="dark:text-white light:text-text-dark text-sm font-semibold">{p.user?.email || 'Unknown user'}</div>
                  <div className="text-xs dark:text-gray-400 light:text-slate-500">${Number(p.amount || 0).toFixed(2)} · {p.status} · {p.paymentMethod || 'N/A'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
          <h2 className="text-lg font-bold dark:text-white light:text-text-dark mb-4">Recent Registrations</h2>
          {(data?.recentUsers || []).length === 0 ? (
            <p className="text-sm dark:text-gray-400 light:text-slate-500">No recent registrations.</p>
          ) : (
            <div className="space-y-2">
              {(data?.recentUsers || []).map((u: any) => (
                <div key={u.id} className="rounded-lg border dark:border-white/10 light:border-green-300 dark:bg-black/20 light:bg-green-50 p-3">
                  <div className="dark:text-white light:text-text-dark text-sm font-semibold">{u.name || u.email}</div>
                  <div className="text-xs dark:text-gray-400 light:text-slate-500">{u.email} · {new Date(u.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
