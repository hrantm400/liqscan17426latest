import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/userApi';
import { toast } from 'react-hot-toast';
import { CoreLayerAdminCard } from './CoreLayerAdminCard';

export function AdminSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminApi.getAdminSettings(),
  });

  const launchPromoMutation = useMutation({
    mutationFn: (enabled: boolean) => adminApi.patchAdminLaunchPromo(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['public', 'site-status'] });
      toast.success('Launch promo setting updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const cisdMutation = useMutation({
    mutationFn: (payload: { cisdPivotLeft: number; cisdPivotRight: number; cisdMinConsecutive: number }) => 
      adminApi.patchAdminCisdConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['public', 'site-status'] });
      toast.success('CISD config updated. New backend signs will use this immediately.');
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const [cisdForm, setCisdForm] = useState({
    cisdPivotLeft: 5,
    cisdPivotRight: 2,
    cisdMinConsecutive: 2,
  });

  useEffect(() => {
    if (data) {
      setCisdForm({
        cisdPivotLeft: data.cisdPivotLeft ?? 5,
        cisdPivotRight: data.cisdPivotRight ?? 2,
        cisdMinConsecutive: data.cisdMinConsecutive ?? 2,
      });
    }
  }, [data]);

  if (isLoading) return <div className="dark:text-white light:text-text-dark">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black dark:text-white light:text-text-dark">Admin Settings</h1>
        <p className="dark:text-gray-400 light:text-slate-500">Runtime config, launch promo, and SMTP diagnostics</p>
      </div>

      <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
        <div className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500 mb-3">Launch promo</div>
        <p className="text-sm dark:text-gray-400 light:text-slate-600 mb-4 max-w-xl">
          When enabled, all FREE accounts get full Pro product access (monitors, quotas, course media, Telegram symbol limits) until you turn it off. Billing tier stays FREE — subscription page is unchanged.
        </p>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-5 h-5 rounded border dark:border-white/20 light:border-slate-300 accent-primary"
            checked={Boolean(data?.launchPromoFullAccess)}
            disabled={launchPromoMutation.isPending}
            onChange={(e) => launchPromoMutation.mutate(e.target.checked)}
          />
          <span className="dark:text-white light:text-text-dark font-semibold">
            Free accounts temporarily have full Pro access
          </span>
        </label>
      </div>

      <CoreLayerAdminCard />

      <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
        <div className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500 mb-3">CISD Structure Settings</div>
        <p className="text-sm dark:text-gray-400 light:text-slate-600 mb-4 max-w-xl">
          Core settings for the CISD scanner. Modifying these changes the rules for future signals dynamically. Note: Historical signals plotted on charts were generated under previous rules, so altering parameters mid-flight may cause visual discrepancies for past patterns!
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <label className="block">
            <span className="text-sm font-semibold dark:text-gray-300 light:text-slate-700 block mb-1">Pivot Lookback Left</span>
            <input 
              type="number" min="1" max="50"
              className="w-full bg-transparent border dark:border-white/20 light:border-slate-300 rounded-xl px-3 py-2 dark:text-white"
              value={cisdForm.cisdPivotLeft}
              onChange={e => setCisdForm({ ...cisdForm, cisdPivotLeft: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold dark:text-gray-300 light:text-slate-700 block mb-1">Pivot Lookback Right</span>
            <input 
              type="number" min="1" max="50"
              className="w-full bg-transparent border dark:border-white/20 light:border-slate-300 rounded-xl px-3 py-2 dark:text-white"
              value={cisdForm.cisdPivotRight}
              onChange={e => setCisdForm({ ...cisdForm, cisdPivotRight: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold dark:text-gray-300 light:text-slate-700 block mb-1">Min Consecutive Candles</span>
            <input 
              type="number" min="1" max="50"
              className="w-full bg-transparent border dark:border-white/20 light:border-slate-300 rounded-xl px-3 py-2 dark:text-white"
              value={cisdForm.cisdMinConsecutive}
              onChange={e => setCisdForm({ ...cisdForm, cisdMinConsecutive: Number(e.target.value) })}
            />
          </label>
        </div>
        <button
          className="px-4 py-2 bg-primary text-black font-bold rounded-xl"
          disabled={cisdMutation.isPending}
          onClick={() => Object.values(cisdForm).some(v => isNaN(v) || v < 1 || v > 50) ? toast.error('Values must be 1-50') : cisdMutation.mutate(cisdForm)}
        >
          Save CISD Configuration
        </button>
      </div>

      <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
        <div className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500 mb-3">Pricing</div>
        <div className="dark:text-white light:text-text-dark">BASE_PRICE: {data?.pricing?.basePrice}</div>
        <div className="dark:text-white light:text-text-dark">FIRST_MONTH_PRICE: {data?.pricing?.firstMonthPrice}</div>
        <div className="dark:text-white light:text-text-dark">PAYMENT_TIMEOUT_MINUTES: {data?.pricing?.paymentTimeoutMinutes}</div>
      </div>

      <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
        <div className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500 mb-3">Wallets</div>
        <div className="dark:text-white light:text-text-dark break-all">TRC20: {data?.wallets?.trc20 || 'not set'}</div>
        <div className="dark:text-white light:text-text-dark break-all">BEP20: {data?.wallets?.bep20 || 'not set'}</div>
      </div>

      <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5">
        <div className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500 mb-3">SMTP</div>
        <div className="dark:text-white light:text-text-dark">Host: {data?.smtp?.host || 'not set'}</div>
        <div className="dark:text-white light:text-text-dark">Port: {data?.smtp?.port}</div>
        <div className="dark:text-white light:text-text-dark">User: {data?.smtp?.user || 'not set'}</div>
        <div className="dark:text-white light:text-text-dark">Configured: {data?.smtp?.configured ? 'yes' : 'no'}</div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={async () => {
              try {
                await adminApi.testAdminSmtp();
                toast.success('SMTP test sent');
                refetch();
              } catch (e: any) {
                toast.error(e.message || 'SMTP test failed');
              }
            }}
            className="px-3 py-2 rounded-xl bg-primary text-black font-bold"
          >
            Send SMTP Test
          </button>
        </div>
      </div>
    </div>
  );
}

