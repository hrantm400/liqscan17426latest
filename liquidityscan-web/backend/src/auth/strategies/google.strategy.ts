import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    
    if (!clientID || !clientSecret) {
      // Выбрасываем ошибку, но она будет обработана в useFactory
      throw new Error('Google OAuth credentials are not configured');
    }
    
    super({
      clientID,
      clientSecret,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos, id } = profile;
    const user = {
      id,
      email: emails[0].value,
      name: name?.givenName || emails[0].value.split('@')[0],
      displayName: name?.givenName + ' ' + name?.familyName,
      photos: photos,
      emails: emails,
    };
    done(null, user);
  }
}
