import { Controller, Post, Get, Body, UseGuards, Req, Res, Query } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto';
import { GoogleOauthGuard } from './guards/google-oauth.guard';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('google/one-tap')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async googleOneTap(@Body('credential') credential: string) {
    return this.authService.googleOneTapLogin(credential);
  }

  /** Exchange one-time code from Google redirect for access + refresh tokens (no secrets in URL). */
  @Post('oauth/exchange')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 25, ttl: 60000 } })
  async oauthExchange(@Body() dto: OAuthExchangeDto) {
    return this.authService.exchangeOAuthCode(dto.code);
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
