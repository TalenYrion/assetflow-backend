import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import oauthConfig from 'src/config/oauth.config';
import { AuthService } from '../auth.service';

@Injectable()
export class OauthStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @Inject(oauthConfig.KEY)
    private oauthConfiguration: ConfigType<typeof oauthConfig>,
    private authService: AuthService,
  ) {
    super({
      clientID: oauthConfiguration.clientId as string,
      clientSecret: oauthConfiguration.clientSecret as string,
      callbackURL: oauthConfiguration.callbackUrl as string,
      scope: ['email', 'profile'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: any) {
    const user = this.authService.validateGoogleUser({
      email: profile.emails[0].value,
      firstName: profile.name.givenName,
      lastName: profile.name.familyName,
      avatarUrl: profile.photos[0].value,
      password: '',
      bio: '',
    });

    return user;
  }
}
