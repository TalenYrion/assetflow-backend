import { registerAs } from '@nestjs/config';
import { JwtSignOptions } from '@nestjs/jwt';

export default registerAs(
  'rerfesh',
  (): JwtSignOptions => ({
    secret: process.env.REFRESH_JWT_SECRET,
    expiresIn: (process.env.REFRESH_JWT_EXPIRES_IN as '7d') || '7d',
  }),
);
