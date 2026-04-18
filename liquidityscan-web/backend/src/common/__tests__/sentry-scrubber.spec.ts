import { beforeSend, scrubDeep } from '../sentry.config';
import type { ErrorEvent } from '@sentry/node';

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    event_id: 'evt_test',
    ...overrides,
  } as ErrorEvent;
}

describe('Sentry beforeSend scrubber (PR 3.2)', () => {
  describe('path-based body stripping', () => {
    it('drops request body on /api/auth/login', () => {
      const ev = makeEvent({
        request: {
          url: 'https://liquidityscan.io/api/auth/login',
          method: 'POST',
          data: { email: 'a@b.test', password: 'secret123' },
        },
      });
      const out = beforeSend(ev)!;
      expect(out.request?.data).toBeUndefined();
    });

    it('drops request body on /api/payments/start', () => {
      const ev = makeEvent({
        request: {
          url: 'https://liquidityscan.io/api/payments/start',
          method: 'POST',
          data: { network: 'USDT_TRC20', amount: 49, walletAddress: 'T1234567' },
        },
      });
      const out = beforeSend(ev)!;
      expect(out.request?.data).toBeUndefined();
    });

    it('drops request body on /api/admin/payments/:id/refund', () => {
      const ev = makeEvent({
        request: {
          url: 'https://liquidityscan.io/api/admin/payments/pay_123/refund',
          method: 'PUT',
          data: { reason: 'dispute', adminNotes: 'chargeback filed' },
        },
      });
      const out = beforeSend(ev)!;
      expect(out.request?.data).toBeUndefined();
    });

    it('preserves request body on non-sensitive path but deep-scrubs it', () => {
      const ev = makeEvent({
        request: {
          url: 'https://liquidityscan.io/api/signals/ict-bias',
          method: 'POST',
          data: {
            symbol: 'BTCUSDT',
            timeframe: '1h',
            nested: { token: 'leaked-token', symbol: 'ETHUSDT' },
          },
        },
      });
      const out = beforeSend(ev)!;
      const data = out.request?.data as {
        symbol: string;
        timeframe: string;
        nested: { token: string; symbol: string };
      };
      expect(data.symbol).toBe('BTCUSDT');
      expect(data.timeframe).toBe('1h');
      expect(data.nested.token).toBe('[Filtered]');
      expect(data.nested.symbol).toBe('ETHUSDT');
    });
  });

  describe('header scrubbing', () => {
    it('replaces Authorization, Cookie, Set-Cookie, and x-webhook-secret with [Filtered]', () => {
      const ev = makeEvent({
        request: {
          url: 'https://liquidityscan.io/api/signals',
          method: 'GET',
          headers: {
            Authorization: 'Bearer eyJhbGc...leakedJWT',
            Cookie: 'rt=eyJ...leakedRT; sessionId=abc',
            'Set-Cookie': 'rt=secret; HttpOnly',
            'x-webhook-secret': 'webhook-signing-key',
            'user-agent': 'Mozilla/5.0',
          },
        },
      });
      const out = beforeSend(ev)!;
      const h = out.request?.headers as Record<string, string>;
      expect(h.Authorization).toBe('[Filtered]');
      expect(h.Cookie).toBe('[Filtered]');
      expect(h['Set-Cookie']).toBe('[Filtered]');
      expect(h['x-webhook-secret']).toBe('[Filtered]');
      expect(h['user-agent']).toBe('Mozilla/5.0');
    });
  });

  describe('user pruning', () => {
    it('drops email/username/ip, keeps only id', () => {
      const ev = makeEvent({
        user: {
          id: 'u_123',
          email: 'leaked@example.com',
          username: 'leaker',
          ip_address: '1.2.3.4',
        },
      });
      const out = beforeSend(ev)!;
      expect(out.user).toEqual({ id: 'u_123' });
    });
  });

  describe('deep key scrubbing in extra and contexts', () => {
    it('redacts password/accessToken/refreshToken/credential deep inside extra', () => {
      const ev = makeEvent({
        extra: {
          level0: {
            password: 'should-not-appear',
            accessToken: 'jwt-leak',
            refreshToken: 'rt-leak',
            credential: 'google-idtoken',
            nested: { token: 'deep-leak', safe: 'keep-me' },
          },
        },
      });
      const out = beforeSend(ev)!;
      const level0 = (out.extra!.level0 as Record<string, unknown>);
      expect(level0.password).toBe('[Filtered]');
      expect(level0.accessToken).toBe('[Filtered]');
      expect(level0.refreshToken).toBe('[Filtered]');
      expect(level0.credential).toBe('[Filtered]');
      const nested = level0.nested as Record<string, string>;
      expect(nested.token).toBe('[Filtered]');
      expect(nested.safe).toBe('keep-me');
    });

    it('scrubDeep is bounded — does not overflow on deeply recursive input', () => {
      const root: Record<string, unknown> = { token: 'visible-at-depth-0' };
      let cur: Record<string, unknown> = root;
      for (let i = 0; i < 30; i++) {
        const next: Record<string, unknown> = { token: `depth-${i}` };
        cur.next = next;
        cur = next;
      }
      expect(() => scrubDeep(root)).not.toThrow();
      const scrubbed = scrubDeep(root) as Record<string, unknown>;
      expect(scrubbed.token).toBe('[Filtered]');
    });
  });
});
