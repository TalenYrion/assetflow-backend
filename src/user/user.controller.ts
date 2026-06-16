import {
  Body,
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CreateUserDto } from './dto/createUser.dto';
import { UserService } from './user.service';
import { LocalAuthGuard } from 'src/auth/guards/local-auth/local-auth.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth/jwt-auth.guard';
import { Roles } from 'src/auth/decorators/role.decorator';
import { Role } from './enums/role.enum';
import { RoleAuthGuard } from 'src/auth/guards/role-auth/role-auth.guard';
import { Public } from 'src/auth/decorators/public.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateUseDto } from './dto/updateUser.dto';
import { UpdatePasswordDto } from './dto/updateSetting.dto';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Public()
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  createUser(
    @Body() createUserDto: CreateUserDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            fileType: 'image/(jpeg|png|webp|svg\\+xml)',
          }),
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.userService.createUser(createUserDto, file);
  }

  @UseGuards(JwtAuthGuard, RoleAuthGuard)
  @Post('profile')
  getProfile(@Req() req) {
    return this.userService.getProfile(req.user.id);
  }

@Patch('profile')
  @UseInterceptors(FileInterceptor('avatar'))
  async updateProfile(
    @Req() req: any,
    @Body() updateDto: UpdateUseDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = req.user?.id;
    return await this.userService.updateProfile(userId, updateDto, file);
  }

  @Patch('password')
  async updatePassword(@Req() req: any, @Body() updatePasswordDto: UpdatePasswordDto) {
    const userId = req.user?.id;
    return await this.userService.updatePassword(userId, updatePasswordDto);
  }
}
