import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) { }

  private isAdminEmail(email: string): boolean {
    const adminEmails = this.configService.get<string>('ADMIN_EMAILS', '');
    if (!adminEmails) return false;

    const emailList = adminEmails.split(',').map(e => e.trim().toLowerCase());
    return emailList.includes(email.toLowerCase());
  }

  async register(dto: RegisterDto) {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Check if email is in admin list
    const isAdmin = this.isAdminEmail(dto.email);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        isAdmin,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        isAdmin: true,
        tier: true,
        subscriptionId: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user,
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    // Find user
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if email is in admin list and update isAdmin if needed
    const shouldBeAdmin = this.isAdminEmail(dto.email);
    if (shouldBeAdmin !== user.isAdmin) {
      // Update user's admin status
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: shouldBeAdmin },
      });
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        tier: user.tier,
        subscriptionId: user.subscriptionId,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        timezone: user.timezone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      ...tokens,
    };
  }

  /**
   * Find or create user from Google OAuth profile (no tokens).
   */
  async syncGoogleUser(profile: any): Promise<User> {
    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.id },
    });

    if (!user) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: profile.emails[0].value },
      });

      if (existingUser) {
        const isAdmin = this.isAdminEmail(profile.emails[0].value);
        user = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            googleId: profile.id,
            isAdmin: isAdmin,
          },
        });
      } else {
        const isAdmin = this.isAdminEmail(profile.emails[0].value);
        user = await this.prisma.user.create({
          data: {
            email: profile.emails[0].value,
            name: profile.displayName || profile.name?.givenName,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value,
            isAdmin,
          },
        });
      }
    } else {
      const shouldBeAdmin = this.isAdminEmail(user.email);
      if (shouldBeAdmin !== user.isAdmin) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { isAdmin: shouldBeAdmin },
        });
      }
    }

    return user;
  }

  async googleLogin(profile: any) {
    const user = await this.syncGoogleUser(profile);
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        tier: user.tier,
        subscriptionId: user.subscriptionId,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        timezone: user.timezone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      ...tokens,
    };
  }

  async createOAuthExchangeCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await this.prisma.oAuthAuthorizationCode.create({
      data: { code, userId, expiresAt },
    });
    return code;
  }

  async exchangeOAuthCode(code: string) {
    const row = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { code },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired authorization code');
    }

    await this.prisma.oAuthAuthorizationCode.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    const user = await this.validateUser(row.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user,
      ...tokens,
    };
  }

  async googleOneTapLogin(credential: string) {
    if (!credential) {
      throw new UnauthorizedException('Google credential is required');
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException('Google OAuth is not configured');
    }

    const oauthClient = new OAuth2Client(clientId);
    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    const profile = {
      id: payload.sub,
      emails: [{ value: payload.email }],
      displayName: payload.name || payload.email,
      name: {
        givenName: payload.given_name || payload.name || payload.email.split('@')[0],
        familyName: payload.family_name || '',
      },
      photos: payload.picture ? [{ value: payload.picture }] : [],
    };

    return this.googleLogin(profile);
  }

  async validateUser(userId: string) {
    if (!userId) {
      return null;
    }
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        isAdmin: true,
        tier: true,
        subscriptionId: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return null;
    }

    // Check if email is in admin list and update isAdmin if needed
    const shouldBeAdmin = this.isAdminEmail(user.email);
    if (shouldBeAdmin !== user.isAdmin) {
      // Update user's admin status
      const updatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: shouldBeAdmin },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          isAdmin: true,
          tier: true,
          subscriptionId: true,
          subscriptionStatus: true,
          subscriptionExpiresAt: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return updatedUser;
    }

    return user;
  }

  async refreshToken(refreshToken: string) {
    // Find refresh token
    const token = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!token || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Generate new tokens
    const tokens = await this.generateTokens(token.userId, token.user.email);

    // Delete old refresh token
    await this.prisma.refreshToken.delete({
      where: { id: token.id },
    });

    return tokens;
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d',
    });

    // Save refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
