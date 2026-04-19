// Stub ESM-only deps pulled in transitively via services that touch the
// TelegramService → satori-html chain. AuthService itself never reaches them,
// but the jest module graph may still walk there via the auth module.
jest.mock('satori-html', () => ({ html: jest.fn() }));
jest.mock('satori', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@resvg/resvg-js', () => ({ Resvg: jest.fn() }));

import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Minimal harness for AuthService.generateTokens():
 *   - real JwtService so tokens actually round-trip through jsonwebtoken.sign
 *   - ConfigService mocked with the two secrets the method reads
 *   - PrismaService.refreshToken.create mocked so we can capture the string
 *     that would have been persisted (and keep the test DB-free).
 * The method is private — we call it via bracket notation, which is fine in
 * unit-test scope and mirrors the style used for `['privateHelper']` elsewhere.
 */
function makeService() {
  const ACCESS_SECRET = 'test-access-secret';
  const REFRESH_SECRET = 'test-refresh-secret';

  const jwtService = new JwtService({
    secret: ACCESS_SECRET,
    signOptions: { expiresIn: '1h' },
  });

  const configService = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '30d';
      return fallback;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_REFRESH_SECRET') return REFRESH_SECRET;
      throw new Error(`unexpected config key: ${key}`);
    }),
  } as any;

  const refreshCreate = jest.fn().mockResolvedValue(undefined);
  const prismaService = {
    refreshToken: { create: refreshCreate },
  } as any;

  const service = new AuthService(prismaService, jwtService, configService);

  return { service, refreshCreate, ACCESS_SECRET, REFRESH_SECRET };
}

describe('AuthService.generateTokens (PR 3.3b — jti race fix)', () => {
  it('produces byte-different refresh tokens when called twice for the same user within the same wall-clock second', async () => {
    const { service, refreshCreate } = makeService();
    const USER_ID = 'user-abc';
    const EMAIL = 'a@a.test';

    // Freeze time so both sign() calls get the same `iat`. This is the exact
    // production race: identical {sub, email, iat, secret, expiresIn} would
    // otherwise produce byte-identical JWTs.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-19T18:00:00.000Z'));

    try {
      const first = await (service as any).generateTokens(USER_ID, EMAIL);
      const second = await (service as any).generateTokens(USER_ID, EMAIL);

      expect(first.refreshToken).not.toEqual(second.refreshToken);
      expect(first.accessToken).not.toEqual(second.accessToken);

      expect(refreshCreate).toHaveBeenCalledTimes(2);
      const persisted = (refreshCreate.mock.calls as Array<[{ data: { token: string } }]>).map(
        (c) => c[0].data.token,
      );
      expect(persisted[0]).not.toEqual(persisted[1]);

      const iat1 = (jwt.decode(first.refreshToken) as any).iat;
      const iat2 = (jwt.decode(second.refreshToken) as any).iat;
      expect(iat1).toEqual(iat2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('embeds a UUID v4 jti in both access and refresh JWTs alongside sub/email/iat/exp', async () => {
    const { service } = makeService();
    const USER_ID = 'user-def';
    const EMAIL = 'b@b.test';

    const tokens = await (service as any).generateTokens(USER_ID, EMAIL);

    const accessDecoded = jwt.decode(tokens.accessToken) as Record<string, unknown>;
    const refreshDecoded = jwt.decode(tokens.refreshToken) as Record<string, unknown>;

    expect(accessDecoded).toMatchObject({
      sub: USER_ID,
      email: EMAIL,
      jti: expect.stringMatching(UUID_V4_RE),
      iat: expect.any(Number),
      exp: expect.any(Number),
    });

    expect(refreshDecoded).toMatchObject({
      sub: USER_ID,
      email: EMAIL,
      jti: expect.stringMatching(UUID_V4_RE),
      iat: expect.any(Number),
      exp: expect.any(Number),
    });

    // The two tokens must carry distinct jti values — different random UUIDs.
    expect(accessDecoded.jti).not.toEqual(refreshDecoded.jti);
  });
});
