import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => {
  return {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  };
});
