/**
 * nestjs-pino configuration — PR 3.2.
 *
 * Structured single-line JSON logs with:
 *   - per-request ID (X-Request-Id header passthrough, else UUID)
 *   - explicit redaction of sensitive headers and response Set-Cookie
 *   - autoLogging.ignore on /api/health + SSE candle streams (prevents
 *     log spam from the every-10s dashboard heartbeat and from long-lived
 *     streaming connections)
 *   - pino-pretty transport in dev for human-readable output; raw JSON
 *     in production
 *
 * pino-http does NOT log request or response bodies by default — this
 * is the first line of defense against credential leakage, ahead of the
 * Sentry beforeSend scrubber.
 */
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Params } from 'nestjs-pino';

const IGNORED_URL_PREFIXES = [
  '/api/health',
  '/api/candles/stream',
  '/socket.io',
] as const;

export const pinoParams: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL || 'info',
    autoLogging: {
      ignore: (req: IncomingMessage) => {
        const url = req.url ?? '';
        return IGNORED_URL_PREFIXES.some((p) => url.startsWith(p));
      },
    },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const incoming = req.headers['x-request-id'];
      const existing = Array.isArray(incoming) ? incoming[0] : incoming;
      const id = existing && existing.length < 100 ? existing : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-webhook-secret"]',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[Redacted]',
    },
    serializers: {
      req: (req: IncomingMessage & { id?: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: ServerResponse) => ({
        statusCode: res.statusCode,
      }),
    },
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: { singleLine: true, colorize: true, translateTime: 'HH:MM:ss.l' },
          }
        : undefined,
  },
};
