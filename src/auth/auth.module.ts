import { BadRequestException, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from 'src/config/jwt.config';
import { ConfigModule, ConfigService, ConfigType } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import refreshConfig from 'src/config/refresh.config';
import { refreshStrategy } from './strategies/refresh.strategy';
import { OauthStrategy } from './strategies/oauth.strategy';
import oauthConfig from 'src/config/oauth.config';

@Module({
  imports: [
    UserModule,
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(refreshConfig),
    ConfigModule.forFeature(oauthConfig),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.get('jwt.config');
        if (!config)
          throw new BadRequestException('error while loading jwt configs');
        return config;
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, refreshStrategy, OauthStrategy],
})
export class AuthModule {}
