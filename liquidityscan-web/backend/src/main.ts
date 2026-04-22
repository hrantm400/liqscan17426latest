// PR 3.2: side-effect import — Sentry.init MUST run before any @nestjs/*
// or http module loads so auto-instrumentation can monkey-patch them.
// Do NOT reorder. Do NOT convert to a named import. Sentry is dormant
// when SENTRY_DSN is unset.
import './common/sentry.config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
// cookie-parser is CJS with `export = cookieParser;` in its d.ts, so the
// TS default-import compiles to `cookie_parser_1.default(...)` which is not
// a function. Use `require` style to get the callable directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => (req: any, res: any, next: any) => void;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(PinoLogger));
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(cookieParser());

  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : ['http://localhost:5173'];

  // PR 3.5 — Security headers.
  //
  // Three-mode CSP via HELMET_CSP_MODE = off | report-only | enforce.
  // Legacy HELMET_CSP=true is honoured as 'report-only' for backward
  // compatibility; set HELMET_CSP_MODE explicitly to override.
  //
  // IMPORTANT: browser CSP is enforced on the response that serves the
  // HTML document, which in prod is nginx, not NestJS. The Helmet CSP
  // below protects /api/* and /socket.io/* responses. The nginx-served
  // /index.html carries its own CSP via
  // /etc/nginx/snippets/liquidityscan-security-headers.conf — keep the
  // two directive sets in sync. See docs/SECURITY_HEADERS.md.
  type CspMode = 'off' | 'report-only' | 'enforce';
  const rawCspMode = process.env.HELMET_CSP_MODE as CspMode | undefined;
  const legacyCspOn = process.env.HELMET_CSP === 'true';
  const cspMode: CspMode =
    rawCspMode === 'off' || rawCspMode === 'report-only' || rawCspMode === 'enforce'
      ? rawCspMode
      : legacyCspOn
        ? 'report-only'
        : 'off';

  const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      'https://accounts.google.com',
      'https://apis.google.com',
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      // Clarity tag loads the full SDK from scripts.clarity.ms (not
      // www.clarity.ms) — observed during PR 3.5 Stage 1.
      'https://*.clarity.ms',
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
      // GSI client ships its own stylesheet at accounts.google.com/gsi/style
      // alongside the JS — observed during PR 3.5 Stage 1.
      'https://accounts.google.com',
    ],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    connectSrc: [
      "'self'",
      'https://liquidityscan.io',
      'wss://liquidityscan.io',
      'https://*.ingest.de.sentry.io',
      'https://accounts.google.com',
      'https://oauth2.googleapis.com',
      'https://www.google-analytics.com',
      'https://region1.google-analytics.com',
      'https://*.clarity.ms',
    ],
    frameSrc: [
      "'self'",
      'https://accounts.google.com',
      // Wistia iframe player used by the Courses feature and the Phase 2
      // Core-Layer intro videos. JS SDK is intentionally not used — iframe
      // embed only — so fast.wistia.com is NOT needed in script-src.
      'https://fast.wistia.net',
    ],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: [],
  };

  app.use(
    helmet({
      // Keep 'cross-origin' (default 'same-origin' can break asset loads
      // when the frontend and API are served from the same host through
      // different upstreams). nginx config is the source of truth for
      // the HTML document's CORP.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy:
        cspMode === 'off'
          ? false
          : { directives: cspDirectives, reportOnly: cspMode === 'report-only' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
    }),
  );

  // Permissions-Policy is not part of Helmet's built-in header set as of
  // v8.x — add it manually. Opt out of browser features we don't use.
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
    );
    next();
  });

  // Enable CORS - restrict to frontend URL

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.LISTEN_HOST ?? '127.0.0.1';
  await app.listen(port, host);
  app.get(PinoLogger).log(
    { host, port, env: process.env.NODE_ENV },
    'Application bootstrap complete',
  );
}

bootstrap();
