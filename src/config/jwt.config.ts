import { registerAs } from '@nestjs/config';

export default registerAs('jwt.config', () => ({
  secret: process.env.JWT_SECRET,
  signOptions: {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
}));
