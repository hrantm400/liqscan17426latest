/**
 * Sentry initialization — PR 3.2.
 *
 * IMPORTANT: this module MUST be imported as the very first line of
 * main.ts (before any @nestjs/* import). Sentry's auto-instrumentation
 * monkey-patches node's http module; if NestJS's HTTP stack loads first
 * those patches are missed.
 *
 * Activation is opt-in: when SENTRY_DSN is unset, Sentry.init() is a
 * no-op and no network calls are made. pino-http is still the first
 * line of defense against log leakage (see logger.config.ts).
 *
 * No @sentry/profiling-node — performance/APM is OUT OF SCOPE of PR 3.2.
 * See TD-11 when profiling is needed (requires ProfilingIntegration +
 * tracesSampleRate > 0).
 */
import { bootProfile } from './boot-profile';
bootProfile('sentry.config: module entered');

// Load .env here: this module runs BEFORE ConfigModule.forRoot() (because
// Sentry must monkey-patch the http module before NestJS boots), so
// process.env.SENTRY_DSN would otherwise be unset when read from .env files.
// No-op if already loaded or the file is missing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
bootProfile('sentry.config: dotenv.config() done');

import * as Sentry from '@sentry/node';
bootProfile('sentry.config: @sentry/node imported');

export const SENSITIVE_PATH_PARTS = [
  '/auth/',
  '/payments/',
  '/admin/',
  '/users/me',
] as const;

export const SENSITIVE_HEADERS = new Set<string>([
  'authorization',
  'cookie',
  'set-cookie',
  'x-webhook-secret',
  'x-api-key',
]);

/**
 * Matches exact key names (case-insensitive) that should never appear in
 * Sentry payloads, breadcrumbs, contexts, or extras.
 */
export const SENSITIVE_KEY_RE = /^(password|passwordhash|accesstoken|refreshtoken|token|credential|rt|smtp_pass|smtppass|webhook_secret|api_key|apikey|secret)$/i;

const FILTERED = '[Filtered]' as const;
const MAX_DEPTH = 6;

/** Deep-redact a payload by key name. Bounded depth to avoid pathological payloads. */
export function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? FILTERED : scrubDeep(v, depth + 1);
  }
  return out;
}

/** Exported so the unit-test suite can assert scrubber behavior without init. */
export function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  const req = event.request;

  if (req?.headers && typeof req.headers === 'object') {
    const headers = req.headers as Record<string, string>;
    for (const k of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.has(k.toLowerCase())) {
        headers[k] = FILTERED;
      }
    }
  }

  if (req?.cookies) {
    req.cookies = FILTERED as unknown as typeof req.cookies;
  }

  const url = req?.url ?? '';
  if (SENSITIVE_PATH_PARTS.some((p) => url.includes(p))) {
    if (req) delete req.data;
  } else if (req?.data !== undefined) {
    req.data = scrubDeep(req.data);
  }

  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  if (event.extra) event.extra = scrubDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) {
    event.contexts = scrubDeep(event.contexts) as NonNullable<Sentry.ErrorEvent['contexts']>;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? (scrubDeep(b.data) as Record<string, unknown>) : b.data,
    }));
  }

  return event;
}

export function initSentry(): void {
  bootProfile('sentry.config: initSentry() entered');
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    bootProfile('sentry.config: initSentry() skipped (no DSN)');
    return;
  }

  bootProfile('sentry.config: Sentry.init() about to call');
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    sampleRate: Number(process.env.SENTRY_SAMPLE_RATE ?? '1.0'),
    sendDefaultPii: false,
    beforeSend,
  });
  bootProfile('sentry.config: Sentry.init() returned');

  // eslint-disable-next-line no-console
  console.log(`[sentry] Initialized with DSN ending in ${dsn.slice(-8)}`);
}

initSentry();
bootProfile('sentry.config: module fully loaded (initSentry() returned)');
