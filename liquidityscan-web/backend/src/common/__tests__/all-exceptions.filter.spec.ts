/**
 * PR 3.2 — AllExceptionsFilter filtering policy tests.
 *
 * Guards against regression of the "skip 4xx, forward 5xx" rule: the
 * day someone flips it to "forward everything", the Sentry dashboard
 * fills with auth-401 noise and this test should catch it in CI.
 */
jest.mock('@sentry/node', () => {
  const captureException = jest.fn();
  const withScope = jest.fn((cb: (scope: unknown) => void) =>
    cb({
      setTag: jest.fn(),
      setContext: jest.fn(),
      setUser: jest.fn(),
    }),
  );
  return { captureException, withScope };
});

import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { AllExceptionsFilter } from '../all-exceptions.filter';

const mockedCapture = Sentry.captureException as jest.Mock;

function makeHost(): ArgumentsHost {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    headersSent: false,
  };
  const req = {
    id: 'req_abc',
    method: 'POST',
    originalUrl: '/api/some/route',
    url: '/api/some/route',
    user: { userId: 'u_1' },
  };
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter (PR 3.2 — 4xx skipped, 5xx forwarded)', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockedCapture.mockClear();
  });

  it('HttpException 404 → NOT forwarded to Sentry', () => {
    filter.catch(new NotFoundException('nope'), makeHost());
    expect(mockedCapture).not.toHaveBeenCalled();
  });

  it('HttpException 401 → NOT forwarded to Sentry (expected auth noise)', () => {
    filter.catch(new UnauthorizedException('bad creds'), makeHost());
    expect(mockedCapture).not.toHaveBeenCalled();
  });

  it('HttpException 400 → NOT forwarded to Sentry (validation)', () => {
    filter.catch(new BadRequestException(['email must be an email']), makeHost());
    expect(mockedCapture).not.toHaveBeenCalled();
  });

  it('HttpException 500 → forwarded to Sentry exactly once', () => {
    filter.catch(new InternalServerErrorException('db down'), makeHost());
    expect(mockedCapture).toHaveBeenCalledTimes(1);
  });

  it('Generic Error (non-HttpException) → forwarded to Sentry exactly once', () => {
    filter.catch(new Error('unexpected boom'), makeHost());
    expect(mockedCapture).toHaveBeenCalledTimes(1);
  });

  it('HttpException with an unusual 503 status → forwarded (boundary coverage)', () => {
    class ServiceUnavailable extends HttpException {
      constructor() {
        super('down', 503);
      }
    }
    filter.catch(new ServiceUnavailable(), makeHost());
    expect(mockedCapture).toHaveBeenCalledTimes(1);
  });
});
