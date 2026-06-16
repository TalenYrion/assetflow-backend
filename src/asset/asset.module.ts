import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from 'src/entity/asset.entity';
import { AssetService } from './asset.service';
import { AssetController } from './asset.controller';
import { FileType } from 'src/entity/file-types.entity';
import { FileTypeModule } from 'src/file-type/file-type.module';
import { ThumbnailModule } from 'src/thumbnail/thumbnail.module';
import { UserModule } from 'src/user/user.module';
import { OrderModule } from 'src/order/order.module';
import { BullModule } from '@nestjs/bullmq';
import { User } from 'src/entity/user.entity';
import { Order } from 'src/entity/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Asset, User, Order]),
    BullModule.registerQueue({
      name: 'thumbnail-process',
    }),
    FileTypeModule,
    ThumbnailModule,
    OrderModule,
  ],
  providers: [AssetService],
  exports: [AssetService],
  controllers: [AssetController],
})
export class AssetModule {}
