import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => {
  return {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecretConnect: process.env.STRIPE_WEBHOOK_SECRET_CONNECT,
    webhookSecretStandard: process.env.STRIPE_WEBHOOK_SECRET_STANDARD,
  };
});
