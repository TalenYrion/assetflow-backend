import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entity/user.entity';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/createUser.dto';
import { AssetService } from 'src/asset/asset.service';
import { OrderService } from 'src/order/order.service';
import { Role } from './enums/role.enum';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { UpdateUseDto } from './dto/updateUser.dto'; // Ensure path matches your setup
import { UpdatePasswordDto } from './dto/updateSetting.dto';

Injectable();
export class UserService {
  private supabase: SupabaseClient;
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private assetService: AssetService,
    private configService: ConfigService,
  ) {
    const url = this.configService.get('supabase.url');
    const key = this.configService.get('supabase.key');
    if (!key && !url)
      throw new BadRequestException('supabase url or key is missing');
    this.supabase = createClient(url, key);
  }

  async createUser(createUserDto: CreateUserDto, file?: Express.Multer.File) {
    const bucket = await this.configService.get('supabase.userProfileBucket');
    let user = await this.userRepository.create(createUserDto);
    user = await this.userRepository.save(user);

    if (!createUserDto.avatarUrl && !file) {
      user.avatarUrl =
        'https://auffenstcauzqynjbmps.supabase.co/storage/v1/object/public/user-static-profile/defualt_user.svg';
    }

    if (file) {
      const filePath = `profile-${user.id}/${Date.now()}-${file.originalname}`;
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file.buffer, { contentType: file.mimetype });
      if (error)
        throw new BadRequestException(`Upload failed: ${error.message}`);
      const {
        data: { publicUrl },
      } = await this.supabase.storage.from(bucket).getPublicUrl(filePath);
      user.avatarUrl = publicUrl;
    }

    return await this.userRepository.save(user);
  }

  async findByEmail(email: string) {
    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password'],
    });

    return user;
  }

  async toggleWishlist(userId: number, assetId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['wishlist'],
    });
    if (!user) throw new NotFoundException('user not found');
    const asset = await this.assetService.findWishlist(assetId);

    if (!asset) throw new NotFoundException('asset not found');

    const isWishlisted = user.wishlist.some((item) => item.id === assetId);

    if (isWishlisted) {
      user.wishlist = user.wishlist.filter((item) => item.id !== assetId);
    } else {
      user.wishlist.push(asset);
    }

    // 4. Save the user (TypeORM updates the join table automatically)
    await this.userRepository.save(user);

    return {
      wishlisted: !isWishlisted,
      message: isWishlisted ? 'Removed from wishlist' : 'Added to wishlist',
    };
  }

  async getProfile(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'firstName',
        'lastName',
        'email',
        'avatarUrl',
        'role',
        'stripeAccountId',
        'stripeAccountId',
        'onboardingStatus',
        'updatedAt',
        'bio',
        'updatedAt',
      ],
    });

    if (!user) throw new BadRequestException('invalide credentials');
    return user;
  }

  async findOne(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'role',
        'avatarUrl',
        'email',
        'firstName',
        'lastName',
        'refreshToken',
      ],
    });
    if (!user) throw new BadRequestException('invalide credentials');

    return user;
  }

  async updateRefresHToken(userId: number, refreshToken: string) {
    return this.userRepository.update(
      { id: userId },
      { refreshToken: refreshToken },
    );
  }

  async deleteRefreshToken(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) throw new BadRequestException('invalide credentials');

    return this.userRepository.update({ id: userId }, { refreshToken: null });
  }
  async updateProfile(
    userId: number,
    updateDto: UpdateUseDto,
    file?: Express.Multer.File,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User workspace context not found');

    // 1. Process profile updates
    if (updateDto.firstName) user.firstName = updateDto.firstName;
    if (updateDto.lastName) user.lastName = updateDto.lastName;
    if (updateDto.bio !== undefined) user.bio = updateDto.bio;

    // 2. Process binary avatar updates if uploaded
    if (file) {
      const bucket = this.configService.get('supabase.userProfileBucket');
      const filePath = `profile-${user.id}/${Date.now()}-${file.originalname}`;

      const { error } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (error)
        throw new BadRequestException(`Avatar upload failed: ${error.message}`);

      const {
        data: { publicUrl },
      } = this.supabase.storage.from(bucket).getPublicUrl(filePath);
      user.avatarUrl = publicUrl;
    }

    return await this.userRepository.save(user);
  }

  async updatePassword(userId: number, dto: UpdatePasswordDto) {
    // 1. Explicitly select password field since it is marked as select: false in the entity
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });
    if (!user) throw new NotFoundException('User not found');

    // 2. Validate current password match
    const isPasswordValid = await argon2.verify(
      user.password,
      dto.currentPassword,
    );
    if (!isPasswordValid) {
      throw new BadRequestException(
        'The current password provided is incorrect',
      );
    }

    // 3. Hash and manually patch the new credential
    const hashedNewPassword = await argon2.hash(dto.newPassword);
    await this.userRepository.update(
      { id: userId },
      { password: hashedNewPassword },
    );

    return { message: 'Password updated successfully' };
  }
}
