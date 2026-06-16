import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileType } from 'src/entity/file-types.entity';
import { FileTypeService } from './file-type.service';
import { FileTypeController } from './file-type.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FileType])],
  providers: [FileTypeService],
  controllers: [FileTypeController],
  exports: [FileTypeService],
})
export class FileTypeModule {}
