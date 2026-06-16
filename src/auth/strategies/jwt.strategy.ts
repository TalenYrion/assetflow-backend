import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwtConfig from 'src/config/jwt.config';
import { JwtAuthPayload } from '../types/payload';
import { AuthService } from '../auth.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(jwtConfig.KEY)
    private jwtconfiguration: ConfigType<typeof jwtConfig>,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        if (req && req.cookies) {
          return req.cookies['access-token'];
        }
        return null;
      },
      secretOrKey: jwtconfiguration.secret as string,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtAuthPayload) {
    const userId = payload.sub;
    const result = await this.authService.validateJwtUser(userId);
    console.log('result: ', result);
    return result;
  }
}
