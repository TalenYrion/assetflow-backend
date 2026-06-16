import { Module, ValidationPipe } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/entity/user.entity';
import { APP_GUARD } from '@nestjs/core';
import { AssetModule } from 'src/asset/asset.module';
import { OrderModule } from 'src/order/order.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AssetModule],
  controllers: [UserController],
  exports: [UserService],
  providers: [
    UserService,
    {
      provide: APP_GUARD,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidUnknownValues: true,
      }),
    },
  ],
})
export class UserModule {}
