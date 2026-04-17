import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search, DollarSign, CheckCircle, XCircle, Clock, Download } from 'lucide-react';
import { adminApi } from '../../services/userApi';

export function PaymentsManagement() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [network, setNetwork] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'payments', page, search, statusFilter, network, dateFrom, dateTo],
    queryFn: async () => {
      return adminApi.getPayments({ page, limit: 20, search, status: statusFilter, network, dateFrom, dateTo });
    },
  });

  const payments = data?.data || [];
  const total = data?.total || 0;
  const pageCount = data?.pageCount || 1;

  const confirmMutation = useMutation({
    mutationFn: async (paymentId: string) => adminApi.confirmPaymentAdmin(paymentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (paymentId: string) => adminApi.cancelPaymentAdmin(paymentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] }),
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-orange-400" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-400';
      case 'cancelled':
        return 'bg-orange-500/10 text-orange-400';
      case 'failed':
        return 'bg-red-500/10 text-red-400';
      default:
        return 'bg-yellow-500/10 text-yellow-400';
    }
  };

  const exportCsv = () => {
    const rows = payments.map((p: any) => ({
      id: p.id,
      user: p.user?.email || '',
      amount: p.amount,
      currency: p.currency,
      method: p.paymentMethod || '',
      status: p.status,
      txHash: p.paymentId || '',
      createdAt: p.createdAt,
    }));
    const header = Object.keys(rows[0] || {}).join(',');
    const body = rows.map((row: any) => Object.values(row).map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black dark:text-white light:text-text-dark mb-2">Payments Management</h1>
        <p className="dark:text-gray-400 light:text-slate-500">View and manage all payments</p>
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 dark:text-gray-400 light:text-slate-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Search payments..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              data-clarity-mask="true"
              className="w-full pl-10 pr-4 py-2 rounded-xl dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark dark:placeholder-gray-500 light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 rounded-xl dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="" className="dark:bg-background-dark light:bg-background-light">All Status</option>
            <option value="pending" className="dark:bg-background-dark light:bg-background-light">Pending</option>
            <option value="completed" className="dark:bg-background-dark light:bg-background-light">Completed</option>
            <option value="cancelled" className="dark:bg-background-dark light:bg-background-light">Cancelled</option>
            <option value="failed" className="dark:bg-background-dark light:bg-background-light">Failed</option>
          </select>
          <select
            value={network}
            onChange={(e) => { setNetwork(e.target.value); setPage(1); }}
            className="px-4 py-2 rounded-xl dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark"
          >
            <option value="">All networks</option>
            <option value="crypto_trc20">TRC20</option>
            <option value="crypto_bep20">BEP20</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl dark:bg-white/5 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={exportCsv} className="px-3 py-2 rounded-xl bg-primary/20 text-primary text-sm font-bold flex items-center gap-2 hover:bg-primary/30 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm dark:text-gray-400 light:text-slate-500">
          Showing {payments.length} of {total} payments
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      ) : payments.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <DollarSign className="w-16 h-16 dark:text-gray-500 light:text-slate-500 mx-auto mb-4" />
          <p className="dark:text-gray-400 light:text-slate-500">No payments found</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="dark:bg-white/5 light:bg-green-50 border-b dark:border-white/10 light:border-green-300">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">User</th>
                  <th className="px-6 py-4 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">Method</th>
                  <th className="px-6 py-4 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">Tx Hash</th>
                  <th className="px-6 py-4 text-left text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">Date</th>
                  <th className="px-6 py-4 text-right text-xs font-bold dark:text-gray-400 light:text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-white/10 light:divide-green-300">
                {payments.map((payment: any) => (
                  <motion.tr
                    key={payment.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="dark:hover:bg-white/5 light:hover:bg-green-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium dark:text-white light:text-text-dark">{payment.user?.name || payment.user?.email}</div>
                      <div className="text-sm dark:text-gray-400 light:text-slate-500">{payment.user?.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold dark:text-white light:text-text-dark">
                        ${typeof payment.amount === 'number' ? payment.amount.toFixed(2) : payment.amount} {payment.currency}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-2 w-fit ${getStatusColor(payment.status)}`}>
                        {getStatusIcon(payment.status)}
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 dark:text-gray-300 light:text-slate-600">{payment.paymentMethod || '-'}</td>
                    <td className="px-6 py-4 dark:text-gray-300 light:text-slate-600 font-mono text-xs">
                      {payment.paymentId ? `${String(payment.paymentId).slice(0, 12)}...` : '-'}
                    </td>
                    <td className="px-6 py-4 dark:text-gray-300 light:text-slate-600">
                      {new Date(payment.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {payment.status === 'pending' && (
                          <>
                            <button
                              onClick={async () => {
                                await confirmMutation.mutateAsync(payment.id);
                              }}
                              className="px-2 py-1 rounded bg-green-500/15 text-green-400 text-xs font-bold disabled:opacity-60"
                              disabled={confirmMutation.isPending || cancelMutation.isPending}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={async () => {
                                await cancelMutation.mutateAsync(payment.id);
                              }}
                              className="px-2 py-1 rounded bg-red-500/15 text-red-400 text-xs font-bold disabled:opacity-60"
                              disabled={confirmMutation.isPending || cancelMutation.isPending}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-2 rounded dark:bg-white/10 light:bg-white dark:text-white light:text-text-dark disabled:opacity-40 border dark:border-white/10 light:border-green-300"
          >
            Prev
          </button>
          <span className="px-3 py-2 dark:text-gray-300 light:text-slate-600">Page {page} / {pageCount}</span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-2 rounded dark:bg-white/10 light:bg-white dark:text-white light:text-text-dark disabled:opacity-40 border dark:border-white/10 light:border-green-300"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
