import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthPayload } from './types/payload';
import refreshConfig from 'src/config/refresh.config';
import type { ConfigType } from '@nestjs/config';
import { CurrentUser } from './types/currentUser';
import { CreateUserDto } from 'src/user/dto/createUser.dto';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    @Inject(refreshConfig.KEY)
    private refreshTokenConfig: ConfigType<typeof refreshConfig>,
  ) {}

  private setCookie(res: Response, accessToken: string, refreshToken: string) {
    const isProd =
      process.env.NODE_ENV === 'production' || !!process.env.RENDER;
    res.cookie('access-token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'none',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh-token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'none',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearCookies(res: Response) {
    const isProd =
      process.env.NODE_ENV === 'production' || !!process.env.RENDER;
    res.clearCookie('access-token', {
      path: '/',
      secure: isProd,
      sameSite: 'none',
    });
    res.clearCookie('refresh-token', {
      path: '/',
      secure: isProd,
      sameSite: 'none',
    });
  }

  async login(userId: number, res: Response) {
    const { accessToken, refreshToken } = await this.generateToken(userId);
    const hashedRefreshToken = await argon2.hash(refreshToken);
    await this.userService.updateRefresHToken(userId, hashedRefreshToken);
    this.setCookie(res, accessToken, refreshToken);
    return {
      id: userId,
      accessToken,
    };
  }

  async generateToken(userId: number) {
    const payload: JwtAuthPayload = { sub: userId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.sign(payload),
      this.jwtService.sign(payload, this.refreshTokenConfig),
    ]);
    return { accessToken, refreshToken };
  }

  async ValidateLocalUser(email: string, password: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new BadRequestException('envalid email or password');
    const isPasswordMatch = await argon2.verify(user.password, password);
    if (!isPasswordMatch)
      throw new BadRequestException('invalid password or email');
    return { id: user.id };
  }

  async validateRefreshToken(refreshToken: string, userId: number) {
    const user = await this.userService.findOne(userId);
    if (!user.refreshToken) throw new BadRequestException('empty slot');
    const isRefreshTokenMatch = await argon2.verify(
      user.refreshToken,
      refreshToken,
    );
    if (!isRefreshTokenMatch)
      throw new BadRequestException('invalid credentials');
    return { id: userId };
  }

  async refreshToken(userId: number, res: Response) {
    const { accessToken, refreshToken } = await this.generateToken(userId);
    const hashedRefreshToken = await argon2.hash(refreshToken);
    await this.userService.updateRefresHToken(userId, hashedRefreshToken);
    this.setCookie(res, accessToken, refreshToken);
    return {
      id: userId,
    };
  }

  async validateJwtUser(userId: number) {
    const user = await this.userService.findOne(userId);

    if (!user) throw new BadRequestException('Invalid credentials');

    const currentUser: CurrentUser = {
      id: user.id,
      role: user.role,
      firstName: user.firstName,
      lastName: user?.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl,
    };

    return currentUser;
  }

  async signOut(userId: number, res: Response) {
    this.clearCookies(res);
    return this.userService.deleteRefreshToken(userId);
  }

  async validateGoogleUser(googleUser: CreateUserDto) {
    console.log('google user: ', googleUser);
    const user = await this.userService.findByEmail(googleUser.email);
    if (user) return user;
    return await this.userService.createUser(googleUser);
  }
}
