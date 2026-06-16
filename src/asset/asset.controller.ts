import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AssetService } from './asset.service';
import { CreateAssetDto } from './dto/createAsset.dto';
import { CreateUserDto } from 'src/user/dto/createUser.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ParseIdPipe } from './pipe/parseIdPipe';
import { AssetQueryDto } from './dto/assetQuery.dto';
import { Roles } from 'src/auth/decorators/role.decorator';
import { Role } from 'src/user/enums/role.enum';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('asset')
export class AssetController {
  constructor(private assetService: AssetService) {}

  @Roles(Role.SELLER)
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  createAsset(
    @Body() createAssetDto: CreateAssetDto,
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Asset file is required');
    return this.assetService.createAsset(createAssetDto, req.user.id, file);
  }

  @Roles(Role.SELLER)
  @Patch('status/:id')
  async publishAsset(@Param('id', ParseIdPipe) id: number, @Req() req) {
    return await this.assetService.publishAsset(id, req.user.id);
  }

  @Get('profile/:id')
   getProfile(@Param('id', ParseIdPipe) id: number, @Query() query: AssetQueryDto, ) {
    const pageStr = query.page !== undefined ? String(query.page) : '1';
    const limitStr = query.limit !== undefined ? String(query.limit) : '10';
    const pageNum = Math.max(1, parseInt(pageStr, 10));
    let limitNum = parseInt(limitStr, 10);

    const allowedLimits = [10, 25, 50];

    if (!allowedLimits.includes(limitNum)) {
      limitNum = 10;
    }
    return this.assetService.getPublicCreatorProfile(
	    id,
      pageNum,
      limitNum,
    );
  }



  @Roles(Role.SELLER)
  @UseInterceptors(CacheInterceptor)
  @Get('mine')
  findMyAssets(@Req() req, @Query() query: AssetQueryDto) {
    const pageStr = query.page !== undefined ? String(query.page) : '1';
    const limitStr = query.limit !== undefined ? String(query.limit) : '10';
    const pageNum = Math.max(1, parseInt(pageStr, 10));
    let limitNum = parseInt(limitStr, 10);

    const allowedLimits = [10, 25, 50];

    if (!allowedLimits.includes(limitNum)) {
      limitNum = 10;
    }
    return this.assetService.findByCreator(
      req.user.id,
      true,
      pageNum,
      limitNum,
    );
  }

  @Public()
  @UseInterceptors(CacheInterceptor)
  @Get(':id')
  findOne(@Param('id', ParseIdPipe) id: number, @Req() req) {
    return this.assetService.findOne(id, req.user?.id);
  }

  @Roles(Role.SELLER)
  @Delete(':id')
  deleteAsset(@Param('id', ParseIdPipe) id: number, @Req() req) {
    return this.assetService.deleteAsset(req.user.id, id);
  }

  @Roles(Role.SELLER)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  updateAsset(
    @Param('id', ParseIdPipe) id: number,
    @Req() req,
    @Body() createAssetDto: CreateAssetDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assetService.updateAsset(id, createAssetDto, req.user.id, file);
  }

  @Public()
  @UseInterceptors(CacheInterceptor)
  @Get()
  findAll(@Query() query: AssetQueryDto) {
    const pageStr = query.page !== undefined ? String(query.page) : '1';
    const limitStr = query.limit !== undefined ? String(query.limit) : '10';
    const pageNum = Math.max(1, parseInt(pageStr, 10));
    let limitNum = parseInt(limitStr, 10);

    const allowedLimits = [10, 25, 50];

    if (!allowedLimits.includes(limitNum)) {
      limitNum = 10;
    }

    return this.assetService.findAll(pageNum, limitNum, query);
  }

  @UseInterceptors(CacheInterceptor)
  @Get('user/:id')
  findUserAsset(
    @Param('id', ParseIdPipe) id: number,
    @Query() query: AssetQueryDto,
  ) {
    const pageStr = query?.page ? String(query.page) : '1';
    const limitStr = query?.limit ? String(query.limit) : '10';
    const pageNum = Math.max(1, parseInt(pageStr, 10));
    let limitNum = parseInt(limitStr, 10);

    const allowedLimits = [10, 25, 50];

    if (!allowedLimits.includes(limitNum)) {
      limitNum = 10;
    }
    return this.assetService.findByCreator(id, false, pageNum, limitNum);
  }

  @Get(':id/download')
  async download(@Param('id', ParseIdPipe) id: number, @Req() req) {
    return this.assetService.getDownloadUrl(id, req.user.id);
  }

  @Post('checkout')
  async checkout(@Body('assetId') assetId: number, @Req() req) {
    return this.assetService.createCheckoutSessionAsset(req.user.id, assetId);
  }

}
