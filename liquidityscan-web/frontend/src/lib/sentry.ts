/**
 * Frontend Sentry wrapper — PR 3.2.
 *
 * When VITE_SENTRY_DSN is empty, initSentry() is a no-op and
 * Sentry.captureException calls are silently dropped. This lets us
 * ship the wired-up code to prod and activate in a separate commit.
 */
import * as Sentry from '@sentry/react';

const SENSITIVE_KEY_RE =
  /^(password|passwordhash|accesstoken|refreshtoken|token|credential|rt|secret|api_key|apikey)$/i;

const MAX_DEPTH = 6;

function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? '[Filtered]' : scrubDeep(v, depth + 1);
  }
  return out;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sampleRate: Number(import.meta.env.VITE_SENTRY_SAMPLE_RATE ?? '1.0'),
    sendDefaultPii: false,
    // Third-party script noise — not our bugs, drop before network upload.
    // Deliberately NOT filtering "Failed to fetch" / "Network request failed":
    // those may be legitimate API-reachability errors worth seeing.
    ignoreErrors: [
      // Telegram Android in-app browser injects a WebApp bridge on any site
      // opened via a Telegram chat link. The bridge posts events to the
      // Telegram shell and gets "Method not found" because we are not a
      // registered Telegram Mini App. Fires inside a setTimeout, auto-captured.
      /Error invoking postEvent/i,
      /postEvent.*Method not found/i,
      // Safari / WebKit benign layout-loop detection.
      /ResizeObserver loop limit exceeded/i,
      /ResizeObserver loop completed with undelivered notifications/i,
      // Third-party scripts throwing non-Error objects.
      /Non-Error promise rejection captured/i,
    ],
    beforeSend(event) {
      if (event.user) {
        event.user = event.user.id ? { id: event.user.id } : {};
      }

      if (event.request?.headers) {
        for (const k of Object.keys(event.request.headers)) {
          if (/authorization|cookie|token|secret/i.test(k)) {
            event.request.headers[k] = '[Filtered]';
          }
        }
      }
      if (event.request?.cookies) {
        event.request.cookies = '[Filtered]' as unknown as typeof event.request.cookies;
      }
      if (event.request?.query_string) {
        event.request.query_string =
          typeof event.request.query_string === 'string'
            ? event.request.query_string.replace(/(token|refreshtoken|credential)=[^&]+/gi, '$1=[Filtered]')
            : event.request.query_string;
      }

      if (event.extra) {
        event.extra = scrubDeep(event.extra) as Record<string, unknown>;
      }
      if (event.contexts) {
        event.contexts = scrubDeep(event.contexts) as NonNullable<typeof event.contexts>;
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => ({
          ...b,
          data: b.data ? (scrubDeep(b.data) as Record<string, unknown>) : b.data,
        }));
      }

      return event;
    },
  });
}

export { Sentry };
