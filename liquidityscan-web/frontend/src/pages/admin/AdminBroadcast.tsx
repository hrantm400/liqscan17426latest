import { useState } from 'react';
import { adminApi } from '../../services/userApi';
import { toast } from 'react-hot-toast';

export function AdminBroadcast() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<'email' | 'telegram' | 'both'>('both');
  const [filter, setFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [sending, setSending] = useState(false);
  const telegramPreview = `*${subject || 'Your subject'}*\n\n${body || 'Your message body'}`;

  const send = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    setSending(true);
    try {
      const res = await adminApi.broadcastAdmin({ subject, body, channel, filter });
      toast.success(`Broadcast sent: email ${res.emailSent}, telegram ${res.telegramSent}`);
    } catch (e: any) {
      toast.error(e.message || 'Broadcast failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black dark:text-white light:text-text-dark">Broadcast</h1>
        <p className="dark:text-gray-400 light:text-slate-500">Send message to all users or selected tiers</p>
      </div>

      <div className="rounded-2xl border dark:border-white/10 light:border-green-300 dark:bg-white/5 light:bg-white p-5 space-y-4">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full px-3 py-2 rounded dark:bg-black/30 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message body"
          rows={8}
          className="w-full px-3 py-2 rounded dark:bg-black/30 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className="px-3 py-2 rounded dark:bg-black/30 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark">
            <option value="both">Email + Telegram</option>
            <option value="email">Email only</option>
            <option value="telegram">Telegram only</option>
          </select>
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="px-3 py-2 rounded dark:bg-black/30 light:bg-white border dark:border-white/10 light:border-green-300 dark:text-white light:text-text-dark">
            <option value="all">All users</option>
            <option value="paid">Paid users</option>
            <option value="free">Free users</option>
          </select>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border dark:border-white/10 light:border-green-300 dark:bg-black/20 light:bg-green-50 p-3">
            <div className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500 mb-2">Email Preview</div>
            <div className="dark:text-white light:text-text-dark font-bold">{subject || '(no subject)'}</div>
            <div className="dark:text-gray-300 light:text-slate-700 whitespace-pre-wrap mt-2">{body || '(no body)'}</div>
          </div>
          <div className="rounded-xl border dark:border-white/10 light:border-green-300 dark:bg-black/20 light:bg-green-50 p-3">
            <div className="text-xs uppercase tracking-widest dark:text-gray-500 light:text-slate-500 mb-2">Telegram Preview (Markdown)</div>
            <pre className="dark:text-gray-200 light:text-slate-700 whitespace-pre-wrap text-sm">{telegramPreview}</pre>
          </div>
        </div>
        <p className="text-xs dark:text-gray-500 light:text-slate-500">Telegram supports Markdown (e.g. `*bold*`, `_italic_`).</p>
        <button
          disabled={sending}
          onClick={send}
          className="px-4 py-2 rounded-xl bg-primary text-black font-bold disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send Broadcast'}
        </button>
      </div>
    </div>
  );
}

