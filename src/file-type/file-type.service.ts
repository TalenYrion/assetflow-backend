import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FileType } from 'src/entity/file-types.entity';
import { Repository } from 'typeorm';

@Injectable()
export class FileTypeService {
  constructor(
    @InjectRepository(FileType) private FileRepo: Repository<FileType>,
  ) {}
  async Validation(extension: string) {
    const isFound = await this.FileRepo.findOne({
      where: { extension },
    });

    if (!isFound) return;

    const isAllowed = await this.FileRepo.findOne({
      where: { extension, isActive: true },
    });

    if (!isAllowed)
      throw new BadRequestException('this file format is not allowed');
  }

  async createFileType(extension: string, mimeType: string) {
    const isFound = await this.FileRepo.findOne({
      where: { extension },
    });

    if (isFound) return;
    const newFileType = await this.FileRepo.create({
      extension: extension,
      mimeType: mimeType,
    });
    await this.FileRepo.save(newFileType);
  }

  async getListOfFileTypes() {
    return await this.FileRepo.find({
      where: { isActive: true },
      select: ['extension'], // 💡 Changed from mimeType to match asset extension filtering
      order: { extension: 'ASC' },
    });
  }
}
