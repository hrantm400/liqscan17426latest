// Stub ESM-only deps pulled in transitively via services that touch the
// TelegramService → satori-html chain. Unit tests never exercise image cards.
jest.mock('satori-html', () => ({ html: jest.fn() }));
jest.mock('satori', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@resvg/resvg-js', () => ({ Resvg: jest.fn() }));

import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { Request, Response } from 'express';

type AnyFn = (...args: any[]) => any;

function makeAuthServiceMock(overrides: Record<string, AnyFn> = {}) {
  return {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
    googleOneTapLogin: jest.fn(),
    exchangeOAuthCode: jest.fn(),
    syncGoogleUser: jest.fn(),
    createOAuthExchangeCode: jest.fn(),
    validateUser: jest.fn(),
    ...overrides,
  };
}

function makeRes(): Response {
  const res: Partial<Response> & {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
    redirect: jest.Mock;
  } = {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };
  return res as unknown as Response;
}

function makeReq(cookies: Record<string, string> = {}): Request {
  return { cookies } as unknown as Request;
}

function extractCookieCall(res: Response): { name: string; value: string; opts: any } | undefined {
  const spy = (res.cookie as unknown as jest.Mock).mock.calls[0];
  if (!spy) return undefined;
  return { name: spy[0], value: spy[1], opts: spy[2] };
}

describe('AuthController (PR 3.1 — httpOnly refresh cookie)', () => {
  const TOKENS = { accessToken: 'access-jwt', refreshToken: 'refresh-jwt-v1' };
  const ROTATED = { accessToken: 'access-jwt-2', refreshToken: 'refresh-jwt-v2' };
  const USER = { id: 'u_1', email: 'u@e.test' };

  describe('login', () => {
    it('returns tokens in body AND sets rt cookie (httpOnly, path=/api/auth, sameSite=lax)', async () => {
      const svc = makeAuthServiceMock({
        login: jest.fn().mockResolvedValue({ user: USER, ...TOKENS }),
      });
      const controller = new AuthController(svc as any);
      const res = makeRes();

      const result = await controller.login({ email: 'u@e.test', password: 'p' } as any, res);

      expect(result).toEqual({ user: USER, ...TOKENS });

      const call = extractCookieCall(res);
      expect(call).toBeDefined();
      expect(call!.name).toBe('rt');
      expect(call!.value).toBe(TOKENS.refreshToken);
      expect(call!.opts).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/auth',
      });
      // 30 days in ms.
      expect(call!.opts.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });

  describe('refresh', () => {
    it('prefers req.cookies.rt over body.refreshToken', async () => {
      const svc = makeAuthServiceMock({
        refreshToken: jest.fn().mockResolvedValue(ROTATED),
      });
      const controller = new AuthController(svc as any);
      const res = makeRes();
      const req = makeReq({ rt: 'cookie-token' });

      await controller.refresh(req, 'body-token', res);

      expect(svc.refreshToken).toHaveBeenCalledWith('cookie-token');
      expect(extractCookieCall(res)!.value).toBe(ROTATED.refreshToken);
    });

    it('falls back to body.refreshToken when cookie missing (dual-support)', async () => {
      const svc = makeAuthServiceMock({
        refreshToken: jest.fn().mockResolvedValue(ROTATED),
      });
      const controller = new AuthController(svc as any);
      const res = makeRes();
      const req = makeReq(); // no cookies

      const result = await controller.refresh(req, 'legacy-body-token', res);

      expect(svc.refreshToken).toHaveBeenCalledWith('legacy-body-token');
      expect(result).toEqual(ROTATED);
      expect(extractCookieCall(res)!.value).toBe(ROTATED.refreshToken);
    });

    it('rotates cookie: new value set on every successful refresh', async () => {
      const svc = makeAuthServiceMock({
        refreshToken: jest.fn().mockResolvedValue(ROTATED),
      });
      const controller = new AuthController(svc as any);
      const res = makeRes();

      await controller.refresh(makeReq({ rt: 'v1' }), undefined, res);

      const call = extractCookieCall(res)!;
      expect(call.value).toBe(ROTATED.refreshToken);
      expect(call.value).not.toBe('v1');
    });

    it('throws 401 when neither cookie nor body present', async () => {
      const svc = makeAuthServiceMock();
      const controller = new AuthController(svc as any);
      const res = makeRes();

      await expect(controller.refresh(makeReq(), undefined, res)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(svc.refreshToken).not.toHaveBeenCalled();
      expect((res.cookie as unknown as jest.Mock)).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes token from cookie AND clears cookie', async () => {
      const svc = makeAuthServiceMock();
      const controller = new AuthController(svc as any);
      const res = makeRes();

      await controller.logout(makeReq({ rt: 'to-revoke' }), undefined, res);

      expect(svc.revokeRefreshToken).toHaveBeenCalledWith('to-revoke');
      expect(res.clearCookie).toHaveBeenCalledWith(
        'rt',
        expect.objectContaining({ path: '/api/auth', maxAge: 0 }),
      );
    });

    it('is idempotent — succeeds with no token source at all', async () => {
      const svc = makeAuthServiceMock();
      const controller = new AuthController(svc as any);
      const res = makeRes();

      await expect(controller.logout(makeReq(), undefined, res)).resolves.toBeUndefined();

      expect(svc.revokeRefreshToken).toHaveBeenCalledWith(undefined);
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });

  describe('oauth/exchange + google/one-tap', () => {
    it('oauthExchange sets rt cookie on success', async () => {
      const svc = makeAuthServiceMock({
        exchangeOAuthCode: jest.fn().mockResolvedValue({ user: USER, ...TOKENS }),
      });
      const controller = new AuthController(svc as any);
      const res = makeRes();

      await controller.oauthExchange({ code: 'oauth-code' } as any, res);

      expect(svc.exchangeOAuthCode).toHaveBeenCalledWith('oauth-code');
      expect(extractCookieCall(res)!.value).toBe(TOKENS.refreshToken);
    });

    it('googleOneTap sets rt cookie on success', async () => {
      const svc = makeAuthServiceMock({
        googleOneTapLogin: jest.fn().mockResolvedValue({ user: USER, ...TOKENS }),
      });
      const controller = new AuthController(svc as any);
      const res = makeRes();

      await controller.googleOneTap('google-credential', res);

      expect(svc.googleOneTapLogin).toHaveBeenCalledWith('google-credential');
      expect(extractCookieCall(res)!.value).toBe(TOKENS.refreshToken);
    });
  });
});
