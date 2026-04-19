import {
  Controller,
  Post,
  Get,
  HttpCode,
  Body,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response, CookieOptions } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto';
import { GoogleOauthGuard } from './guards/google-oauth.guard';
import { Public } from './decorators/public.decorator';

/**
 * PR 3.1: refresh token lives in an httpOnly cookie named `rt`.
 * Dual-support Phase 1: backend still accepts `@Body('refreshToken')` as a
 * fallback so legacy clients with cached JS (localStorage-based) keep
 * working until their next hard reload. Body path will be removed in PR 3.1b.
 */
const REFRESH_COOKIE_NAME = 'rt';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d, matches JWT_REFRESH_EXPIRES_IN default

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  }

  private clearRefreshCookie(res: Response) {
    const opts = refreshCookieOptions();
    // Browsers require matching attrs to clear — reuse opts + maxAge: 0.
    res.clearCookie(REFRESH_COOKIE_NAME, { ...opts, maxAge: 0 });
  }

  private extractRefreshToken(req: Request, bodyToken: string | undefined): string | undefined {
    const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE_NAME];
    return cookieToken || bodyToken || undefined;
  }

  @Post('register')
  @Public()
  @UseGuards(ThrottlerGuard)
  // PR 3.3 — account-creation spam guard (was 10/60s).
  @Throttle({ strict: { limit: 3, ttl: 60000 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  // PR 3.3 — credential brute-force guard (was 15/60s). Matches
  // GitHub/Google-class limits.
  @Throttle({ strict: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('refresh')
  @Public()
  @UseGuards(ThrottlerGuard)
  // PR 3.3 — relaxed from 30/60s after PR 3.1 cut access-token TTL to 1h.
  // 60/60s covers ~60 concurrent browser tabs silent-refreshing from
  // the same IP without bumping into the limit.
  @Throttle({ strict: { limit: 60, ttl: 60000 } })
  async refresh(
    @Req() req: Request,
    @Body('refreshToken') bodyToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractRefreshToken(req, bodyToken);
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.authService.refreshToken(token);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('logout')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ strict: { limit: 20, ttl: 60000 } })
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Body('refreshToken') bodyToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractRefreshToken(req, bodyToken);
    await this.authService.revokeRefreshToken(token);
    this.clearRefreshCookie(res);
  }

  @Post('google/one-tap')
  @Public()
  @UseGuards(ThrottlerGuard)
  // PR 3.3 — OAuth brute-force / replay guard (was 20/60s).
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  async googleOneTap(
    @Body('credential') credential: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.googleOneTapLogin(credential);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  /** Exchange one-time code from Google redirect for access + refresh tokens (no secrets in URL). */
  @Post('oauth/exchange')
  @Public()
  @UseGuards(ThrottlerGuard)
  // PR 3.3 — one-time code exchange replay guard (was 25/60s).
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  async oauthExchange(@Body() dto: OAuthExchangeDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.exchangeOAuthCode(dto.code);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Get('google')
  @Public()
  @UseGuards(GoogleOauthGuard)
  async googleAuth() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @Public()
  @UseGuards(GoogleOauthGuard)
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const user = await this.authService.syncGoogleUser(req.user);
    const code = await this.authService.createOAuthExchangeCode(user.id);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = new URL(`${frontendUrl}/oauth-callback`);
    redirectUrl.searchParams.set('code', code);

    res.redirect(redirectUrl.toString());
  }



  @Get('me')
  async getProfile(@Req() req: any) {
    return this.authService.validateUser(req.user.userId);
  }
}
