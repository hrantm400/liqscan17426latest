import { Injectable, ExecutionContext, NotImplementedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleOauthGuard extends AuthGuard('google') {
  canActivate(context: ExecutionContext) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new NotImplementedException('Google login is not enabled on this server');
    }
    return super.canActivate(context);
  }
}
