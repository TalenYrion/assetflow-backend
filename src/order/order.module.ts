import { DynamicModule, Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from 'src/entity/order.entity';
import { OrderService } from './order.service';
import { STRIPE_CLIENT } from './control/stripeProvider';
import Stripe from 'stripe';
import { ConfigModule } from '@nestjs/config';
import { OrderController } from './order.controller';
import orderConfig from './config/order.config';
import { AssetModule } from 'src/asset/asset.module';
import { UserModule } from 'src/user/user.module';
import { User } from 'src/entity/user.entity';
import { Asset } from 'src/entity/asset.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User, Asset]),
    ConfigModule.forFeature(orderConfig),
  ],
  providers: [OrderService],
  exports: [OrderService],
  controllers: [OrderController],
})
export class OrderModule {}
