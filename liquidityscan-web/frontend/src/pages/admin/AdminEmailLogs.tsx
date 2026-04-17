import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/userApi';

export function AdminEmailLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'email-logs', page, search, status],
    queryFn: () => adminApi.getEmailLogsAdmin({ page, limit: 20, search, status }),
  });

  const rows = data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black dark:text-white light:text-text-dark">Email Logs</h1>
        <p className="dark:text-gray-400 light:text-slate-500">Sent/failed emails from reminders, payments and broadcasts</p>
      </div>

      <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipient/subject" className="px-3 py-2 rounded dark:bg-black/30 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded dark:bg-black/30 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark">
          <option value="">All status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {isLoading ? (
        <div className="dark:text-white light:text-text-dark">Loading logs...</div>
      ) : (
        <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white overflow-hidden">
          <table className="w-full">
            <thead className="dark:bg-black/30 light:bg-green-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs dark:text-gray-400 light:text-slate-500 uppercase">To</th>
                <th className="px-4 py-3 text-left text-xs dark:text-gray-400 light:text-slate-500 uppercase">Subject</th>
                <th className="px-4 py-3 text-left text-xs dark:text-gray-400 light:text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs dark:text-gray-400 light:text-slate-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs dark:text-gray-400 light:text-slate-500 uppercase">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.id} className="border-t dark:border-white/10 light:border-green-300">
                  <td className="px-4 py-3 text-sm dark:text-white light:text-text-dark">{row.to}</td>
                  <td className="px-4 py-3 text-sm dark:text-white light:text-text-dark">{row.subject}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded ${row.status === 'sent' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm dark:text-gray-300 light:text-slate-600">{new Date(row.sentAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-red-300">{row.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.pageCount > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-2 rounded dark:bg-white/10 light:bg-white dark:text-white light:text-text-dark disabled:opacity-40 border dark:border-white/10 light:border-green-300">Prev</button>
          <span className="px-3 py-2 dark:text-gray-300 light:text-slate-600">Page {page}/{data.pageCount}</span>
          <button disabled={page >= data.pageCount} onClick={() => setPage((p) => p + 1)} className="px-3 py-2 rounded dark:bg-white/10 light:bg-white dark:text-white light:text-text-dark disabled:opacity-40 border dark:border-white/10 light:border-green-300">Next</button>
        </div>
      )}
    </div>
  );
}

