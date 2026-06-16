import { BadRequestException, Inject, Injectable, Req } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import refreshConfig from 'src/config/refresh.config';
import type { JwtAuthPayload } from '../types/payload';
import { AuthService } from '../auth.service';
import { Request } from 'express';

@Injectable()
export class refreshStrategy extends PassportStrategy(Strategy, 'refresh') {
  constructor(
    @Inject(refreshConfig.KEY)
    private refreshConfiguration: ConfigType<typeof refreshConfig>,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.['refresh-token'];
        },
      ]),
      secretOrKey: refreshConfiguration.secret as string,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }
  async validate(req: any, payLoad: JwtAuthPayload) {
const refreshToken = req.cookies?.['refresh-token'];
  const userId = payLoad.sub;

  if (!refreshToken) {
    throw new BadRequestException('Refresh token missing from request cookies');
  }
  return this.authService.validateRefreshToken(refreshToken, userId);
  }
}
