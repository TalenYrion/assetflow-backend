import { Controller, Get, Req } from '@nestjs/common';
import { FileTypeService } from './file-type.service';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('file-type')
export class FileTypeController {
  constructor(private fileTypeService: FileTypeService) {}
  @Public()
  @Get()
  async getFileTypes() {
    return await this.fileTypeService.getListOfFileTypes();
  }
}
