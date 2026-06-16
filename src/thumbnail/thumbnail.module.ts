import { Module } from '@nestjs/common';
import { ThumbnailService } from './thumbnail.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Thumbnail } from 'src/entity/thumbnail.entity';
import { ThumbnailProcessor } from './thumnail.processor';
import { Asset } from 'src/entity/asset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Thumbnail, Asset])],
  providers: [ThumbnailService, ThumbnailProcessor],
  exports: [ThumbnailService],
})
export class ThumbnailModule {}
