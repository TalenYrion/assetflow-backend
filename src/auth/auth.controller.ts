import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth/local-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth/refresh-auth.guard';
import { Public } from './decorators/public.decorator';
import { GoogleAuthGuard } from './guards/google-auth/google-auth.guard';
import { Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('sign-in')
  login(@Req() req, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(req.user.id, res);
  }

  @Public()
  @UseGuards(RefreshAuthGuard)
  @Post('refresh')
  refreshToken(@Req() req, @Res({ passthrough: true }) res: Response) {
    return this.authService.refreshToken(req.user.id, res);
  }

  @Post('sign-out')
  signOut(@Req() req, @Res({ passthrough: true }) res: Response) {
    return this.authService.signOut(req.user.id, res);
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/login')
  googleLogin() {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req, @Res() res: Response) {
    const response = await this.authService.login(req.user.id, res);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return user;
  }
}
