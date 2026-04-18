import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

/**
 * Global exception filter — PR 3.2.
 *
 * Policy:
 *   - HttpException with status < 500 (400, 401, 403, 404, 409, 422, 429, ...)
 *     → do NOT forward to Sentry. These are expected user-facing errors
 *     (validation, auth, not-found) and would bury real incidents in noise.
 *   - HttpException with status >= 500 OR any non-HttpException
 *     → forward to Sentry with scrubbed request context and user id only
 *     (never email / never password / never tokens).
 *
 * Response behavior mirrors NestJS's default built-in filter so this is a
 * drop-in replacement.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string; user?: { userId?: string } }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttp || status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      Sentry.withScope((scope) => {
        scope.setTag('status_code', String(status));
        scope.setContext('request', {
          id: req.id,
          method: req.method,
          url: req.originalUrl ?? req.url,
        });
        if (req.user?.userId) {
          scope.setUser({ id: req.user.userId });
        }
        Sentry.captureException(exception);
      });
    }

    const body = isHttp
      ? exception.getResponse()
      : { statusCode: status, message: 'Internal server error' };

    if (res.headersSent) return;

    res.status(status).json(
      typeof body === 'string' ? { statusCode: status, message: body } : body,
    );
  }
}
