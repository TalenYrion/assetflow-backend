import {
  Injectable,
  BadRequestException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Order } from 'src/entity/order.entity';
import { In, Repository } from 'typeorm';
import { ConfigService, ConfigType } from '@nestjs/config';
import Stripe from 'stripe';
import orderConfig from './config/order.config';
import { UserService } from 'src/user/user.service';
import { User } from 'src/entity/user.entity';
import { Role } from 'src/user/enums/role.enum';
import { OnboardingStatus } from 'src/user/enums/onboarding.enum';
import { number } from 'joi';
import { OrderStatus } from './enum/orderStatus.enum';
import { REDIS_CLIENT } from 'src/redis/constants/redis.client';
import Redis from 'ioredis';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Asset } from 'src/entity/asset.entity';

@Injectable()
export class OrderService {
  private stripe: InstanceType<typeof Stripe>;

  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    private configService: ConfigService,
    @InjectRepository(User) private userRepo: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
  ) {
    const secret = this.configService.get<string>('stripe.stripeSecretKey');

    if (!secret) {
      throw new Error('Stripe secret key is missing in configuration');
    }

    this.stripe = new Stripe(secret, {
      apiVersion: '2023-10-16' as any,
    });
  }

  async findOrder(userId: number, assetId: number) {
    return await this.orderRepo.findOne({
      where: {
        buyer: { id: userId },
        asset: { id: assetId },
      },
    });
  }

  async handleWebHook(rawBody: Buffer, sig: string) {
    let event: ReturnType<
      InstanceType<typeof Stripe>['webhooks']['constructEvent']
    >;

    const endpointSecret = this.configService.get<string>(
      'stripe.webhookSecret',
    );

    if (!endpointSecret) {
      throw new BadRequestException(
        'Webhook secret is missing in configuration',
      );
    }

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Extract<
        ReturnType<
          InstanceType<typeof Stripe>['webhooks']['constructEvent']
        >['data']['object'],
        { object: 'checkout.session' }
      >;

      const transactionId = session.payment_intent as string;

      const existingOrder = await this.orderRepo.findOne({
        where: { transactionId },
      });

      if (existingOrder) {
        console.log(
          `[Webhook Warning] Order for transaction ${transactionId} already exists. Skipping duplicate event processing.`,
        );
        return { received: true }; // Return success immediately so Stripe stops retrying
      }

      const buyerId = session?.metadata?.buyerId
        ? parseInt(session.metadata.buyerId, 10)
        : null;
      const sellerId = session?.metadata?.sellerId
        ? parseInt(session.metadata.sellerId, 10)
        : null;
      const assetId = session?.metadata?.assetId
        ? parseInt(session.metadata.assetId, 10)
        : null;
      const amount = session.amount_total || 0;
      const platformFeeInCents = Math.round(amount * 0.1);

      if (!buyerId || !sellerId || !assetId) {
        throw new BadRequestException(
          'Required metadata fields (userId, assetId) are missing',
        );
      }

      const asset = await this.assetRepo.findOne({ where: { id: assetId } });
      if (!asset) {
        throw new BadRequestException(
          `Asset with ID ${assetId} no longer exists.`,
        );
      }
      const newOrder = await this.orderRepo.create({
        seller: { id: sellerId },
        buyer: { id: buyerId },
        asset: { id: assetId },
        transactionId: transactionId,
        pricePaid: amount / 100,
        platformFee: platformFeeInCents / 100,
        assetSnapshot: {
          title: asset.title,
          description: asset.description,
          fileExtension: asset.fileExtension,
        },
      });

      await this.orderRepo.save(newOrder);

      console.log(
        `Successfully saved Order to DB for User ${buyerId} buying Asset ${assetId}`,
      );
    }
    if (event.type === 'account.updated') {
      const account = event.data.object as Extract<
        ReturnType<
          InstanceType<typeof Stripe>['webhooks']['constructEvent']
        >['data']['object'],
        { object: 'account' }
      >;

      if (account.charges_enabled || account.details_submitted) {
        await this.userRepo.update(
          { stripeAccountId: account.id },
          { onboardingStatus: OnboardingStatus.ACTIVE },
        );
        console.log(
          `Seller account ${account.id} is officially ready to process payments!`,
        );
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Extract<
        ReturnType<
          InstanceType<typeof Stripe>['webhooks']['constructEvent']
        >['data']['object'],
        { object: 'charge' }
      >;
      const PaymentIntentId = charge.payment_intent as string;
      if (!PaymentIntentId) {
        throw new BadRequestException(
          'Payment Intent ID missing from refund event',
        );
      }
      console.log('payment_intentId: ', PaymentIntentId);
      const order = await this.orderRepo.findOne({
        where: { transactionId: PaymentIntentId },
      });
      if (!order) {
        console.log(
          `[Webhook Warning] Order with transaction ID ${PaymentIntentId} not found for refund.`,
        );
        return { received: true };
      }

      ((order.status = OrderStatus.REFUNDED), await this.orderRepo.save(order));
      console.log(
        `[Refund Success] Order #${order.id} has been marked as REFUNDED.`,
      );
    }

    return { recieved: true };
  }

  // Add this method inside your OrderService class
  async createCheckoutSession(
    userId: number,
    assetId: number,
    assetPrice: number,
    stripeAccountId: string,
    assetTitle: string,
    sellerName: string,
    sellerId: number,
  ) {
    // 1. Look up your database or item details here to get pricing
    const order = await this.orderRepo.findOne({
      where: { buyer: { id: userId }, asset: { id: assetId } },
    });
    if (order)
      throw new BadRequestException(`You have already purchased thise asset`);

    const amountInCents = Math.round(Number(assetPrice) * 100);
    const platformFeeInCents = Math.round(amountInCents * 0.1);

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: assetTitle,
              description: `Purchasing asset from seller: ${sellerName}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],

      payment_intent_data: {
        application_fee_amount: platformFeeInCents,
        transfer_data: {
          destination: stripeAccountId,
        },
      },
      // Pass metadata so your webhook knows who bought what later
      metadata: {
        buyerId: userId.toString(),
        assetId: assetId.toString(),
        sellerId: sellerId.toString(),
      },
      success_url: 'http://localhost:3001/dashboard/buyer',
      cancel_url: 'http://localhost:3001/browse',
    });

    await this.invalidateAssetCache(userId, sellerId);
    console.log('checkout: ', session.url);

    return { url: session.url }; // Return the checkout page URL
  }

  async upgradeToSeller(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('user is not found');
    if (user.role === Role.SELLER)
      throw new BadRequestException('user is alread a seller');

    const account = await this.stripe.accounts.create({
      type: 'express',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const accountLInk = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: 'http://localhost:3001/dashboard/settings',
      return_url: 'http://localhost:3001/dashboard/settings',
      type: 'account_onboarding',
    });

    await this.userRepo.update(
      { id: userId },
      {
        stripeAccountId: account.id,
        role: Role.SELLER,
      },
    );

    return { onboardingUrl: accountLInk.url };
  }

  async getBuyerOrderHistory(userId: number, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const cacheKey = `buyer:order:history:id:${userId}:page:${page}:limit:${limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const [data, total] = await this.orderRepo.findAndCount({
      where: { buyer: { id: userId } },
      relations: ['asset', 'asset.thumbnail'],
      take: limit,
      skip: skip,
      order: { createdAt: 'DESC' },
    });
    const result = { data, total };
    await this.cacheManager.set(cacheKey, result, 30);
    return result;
  }

  async getSellerDashboard(sellerId: number, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const cacheKey = `sellerDashboard:id:${sellerId}:page:${page}:limit:${limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const [sales, total] = await this.orderRepo.findAndCount({
      where: { seller: { id: sellerId } },
      relations: ['buyer', 'asset', 'asset.thumbnail'],
      take: limit,
      skip: skip,
      order: { createdAt: 'DESC' },
    });

    // Query the global lifetime metrics instead of checking current array length
    const metricsResult = await this.orderRepo
      .createQueryBuilder('order')
      .select('SUM(order.pricePaid)', 'totalRevenue')
      .addSelect('SUM(order.platformFee)', 'totalPlatformFee')
      .where('order.sellerId = :sellerId', { sellerId })
      .getRawOne();

    const lifetimeRevenue = Number(metricsResult?.totalRevenue || 0);
    const lifetimePlatformFee = Number(metricsResult?.totalPlatformFee || 0);

    // Get lifetime count from a separate global query, or run a count execution
    const lifetimeSalesCount = await this.orderRepo.count({
      where: { seller: { id: sellerId } },
    });

    const result = {
      metrics: {
        totalRevenue: Number(lifetimeRevenue.toFixed(2)),
        netEarnings: Number((lifetimeRevenue - lifetimePlatformFee).toFixed(2)), // Gross minus Platform cut
        totalSalesCount: lifetimeSalesCount,
      },
      sales: sales.map((order) => ({
        id: order.id,
        transactionId: order.transactionId,
        pricePaid: order.pricePaid,
        platformFee: order.platformFee,
        createdAt: order.createdAt,
        asset: {
          id: order.asset.id,
          title: order.asset.title,
          thumbnailUrl: order.asset.thumbnail?.url || null,
          fileExtension: order.asset.fileExtension,
        },
        buyer: {
          id: order.buyer.id,
          name: `${order.buyer.firstName} ${order.buyer.lastName}`,
          avatarUrl: order.buyer.avatarUrl,
        },
      })),
      total,
    };

    await this.cacheManager.set(cacheKey, result, 300000);
    return result;
  }

  async getStripeLoginLink(userId: number): Promise<{ url: string }> {
    // 1. Verify user exists and has onboarded via Stripe Connect
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'firstName', 'stripeAccountId'],
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    console.log('currentUser: ', user);

    if (!user.stripeAccountId) {
      throw new BadRequestException(
        'No linked Stripe Express account found. Please complete onboarding first.',
      );
    }

    try {
      if (user.onboardingStatus !== 'ACTIVE') {
        const accountLink = await this.stripe.accountLinks.create({
          account: user.stripeAccountId,
          refresh_url: 'http://localhost:3001/dashboard/settings',
          return_url: 'http://localhost:3001/dashboard/settings',
          type: 'account_onboarding',
        });

        return { url: accountLink.url };
      }
      // 2. Request a secure, single-use login link from Stripe
      const loginLink = await this.stripe.accounts.createLoginLink(
        user.stripeAccountId,
      );

      return { url: loginLink.url };
    } catch (error) {
      throw new BadRequestException(
        `Stripe execution error: ${error.message || 'Failed to generate access portal link'}`,
      );
    }
  }

  async invalidateAssetCache(buyerId?: number, sellerId?: number) {
    const patterns = [
      `buyer:order:history:id:${buyerId}`,
      `sellerDashboard:id:${sellerId}`,
    ];

    for (const pattern of patterns) {
      const stream = this.redis.scanStream({
        match: pattern,
        count: 100,
      });
      stream.on('data', async (keys: [string]) => {
        if (keys.length > 0) {
          stream.pause();
          await this.redis.del(...keys);
          stream.resume;
        }
      });
      stream.on('end', () => {
        console.log(` Successfully cleared all keys matching: ${pattern}`);
      });
    }
  }
}
