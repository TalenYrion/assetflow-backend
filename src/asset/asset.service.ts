import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Asset, AssetStatus } from 'src/entity/asset.entity';
import { ILike, In, MoreThanOrEqual, Repository } from 'typeorm';
import { CreateAssetDto } from './dto/createAsset.dto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { FileTypeService } from 'src/file-type/file-type.service';
import { ThumbnailService } from 'src/thumbnail/thumbnail.service';
import { UpdateAssetDto } from './dto/updateAsset.dto';
import { AssetQueryDto } from './dto/assetQuery.dto';
import { UserService } from 'src/user/user.service';
import { OrderService } from 'src/order/order.service';
import { Role } from 'src/user/enums/role.enum';
import { OnboardingStatus } from 'src/user/enums/onboarding.enum';
import { OrderStatus } from 'src/order/enum/orderStatus.enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { REDIS_CLIENT } from 'src/redis/constants/redis.client';
import Redis from 'ioredis';
import { User } from 'src/entity/user.entity';
import { Order } from 'src/entity/order.entity';

@Injectable()
export class AssetService {
  private supabase: SupabaseClient;
  constructor(
    @InjectRepository(Asset) private AssetRepo: Repository<Asset>,
    private fileTypeService: FileTypeService,
    private configService: ConfigService,
    private thumbnailService: ThumbnailService,
    private orderService: OrderService,
    @InjectQueue('thumbnail-process') private thumbnailQueue: Queue,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
  ) {
    const url = this.configService.get('supabase.url');
    const key = this.configService.get('supabase.key');

    if (!url || !key) {
      throw new Error('Supabase URL or Key is missing in configuration');
    }
    this.supabase = createClient(url, key);
  }

  async createAsset(
    createAssetDto: CreateAssetDto,
    userId: number,
    file: Express.Multer.File,
    thumbnailFile?: Express.Multer.File, // <-- Added optional thumbnail receiver
  ) {
    const { mimeType, extension, filePath } = await this.uploadFile(
      file,
      userId,
    );

    await this.fileTypeService.Validation(extension);

    const asset = await this.AssetRepo.create({
      ...createAssetDto,
      fileExtension: extension,
      price: Number(createAssetDto.price),
      creatorId: userId,
      storagePath: filePath,
    });

    const bucket = this.configService.get('supabase.assetBucket');

    await this.AssetRepo.save(asset);

    if (file.mimetype.startsWith('video/')) {
      // Leaves video thumbnail generation alone
      await this.thumbnailQueue.add('generate-video-thumb', {
        assetId: asset.id,
        storagePath: filePath,
        userId,
      });
    } else if (file.mimetype.startsWith('image/')) {
      // Leaves image thumbnail generation alone
      const thumbnail = await this.thumbnailService.createThumbnail(
        file,
        userId,
      );
      asset.thumbnail = thumbnail;
      await this.AssetRepo.save(asset);
    } else {
      // ==========================================
      // NEW HYBRID THUMBNAIL WORKFLOW
      // For ZIP, PDF, DOCX, etc.
      // ==========================================
      let finalThumbnail;

      if (thumbnailFile) {
        // Path 1: User uploaded a custom cover image
        // Sharp resizes, crops, and optimizes to 16:9 WebP
        finalThumbnail = await this.thumbnailService.processCustomThumbnail(
          thumbnailFile,
          userId,
        );
      } else {
        // Path 2: User left it blank
        // Pass title and extension to dynamic SVG generator -> Convert to 16:9 WebP
        finalThumbnail = await this.thumbnailService.generateDynamicThumbnail(
          createAssetDto.title, // or whatever the title property is named in your DTO
          extension,
          userId,
        );
      }

      asset.thumbnail = finalThumbnail;
      await this.AssetRepo.save(asset);
    }

    await this.fileTypeService.createFileType(extension, mimeType);
    await this.invalidateAssetCache(userId);

    return {
      message: 'Asset uploaded successfully. Thumbnail is being processed.',
      asset,
    };
  }
  async uploadFile(file: Express.Multer.File, userId: number) {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    const mimeType = file.mimetype;
    if (!extension) {
      throw new BadRequestException('File has no valid extension');
    }
    const bucket = this.configService.get('supabase.assetBucket');
    const filePath = `user-${userId}/${Date.now()}-${file.originalname}`;

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(filePath, file.buffer, { contentType: file.mimetype });

    if (error) throw new BadRequestException(`Upload failed: ${error.message}`);

    const {
      data: { publicUrl },
    } = this.supabase.storage.from(bucket).getPublicUrl(filePath);
    return { extension, mimeType, filePath };
  }

  async deleteFile(filePath: string, thumbId: number) {
    const bucket = this.configService.get('supabase.assetBucket');
    await this.supabase.storage.from(bucket).remove([filePath]);
    await this.thumbnailService.deleteThumnFile(this.supabase, thumbId);
  }

  async findAll(page: number, limit: number, query: AssetQueryDto) {
    const { search, minPrice, extension } = query;

    // 💡 Turn extension into an array if it's passed as a comma-separated string (e.g., "png,fbx")
    const extensionFilter = extension
      ? Array.isArray(extension)
        ? extension
        : extension.split(',')
      : undefined;

    // Build a distinct cache key matching the array structure
    const extCacheKey = extensionFilter ? extensionFilter.join('-') : 'all';
    const cacheKey = `assets:search=${search || ''}:minPrice=${minPrice || 0}:ext=${extCacheKey}:page=${page}:limit=${limit}`;

    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const skip = (page - 1) * limit;
    const [data, total] = await this.AssetRepo.findAndCount({
      where: {
        status: AssetStatus.PUBLISHED,
        title: search ? ILike(`%${search}%`) : undefined,
        price: minPrice ? MoreThanOrEqual(minPrice) : undefined,

        // 💡 FIX: Uses 'In' so it filters perfectly whether they pick 1 extension or 5
        fileExtension: extensionFilter ? In(extensionFilter) : undefined,
      },
      relations: ['thumbnail', 'creator'],
      take: limit,
      skip: skip,
      order: { updateAT: 'DESC' },
    });

    const result = { data, total };
    await this.cacheManager.set(cacheKey, result, 300000);

    return result;
  }

  async findOne(id: number, userId?: number) {
    const cacheKey = `asset:${id}:user=${userId}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;
    const asset = await this.AssetRepo.findOne({
      where: { id },
      relations: ['thumbnail', 'creator'],
    });
    if (!asset) throw new BadRequestException('Asset not found');
    await this.cacheManager.set(cacheKey, asset, 300000);
    return asset;
  }

  async deleteAsset(userId: number, id: number) {
    const asset = await this.AssetRepo.findOne({
      where: { id },
      relations: ['thumbnail'],
    });
    if (!asset) throw new BadRequestException('asset not found');

    asset.status = AssetStatus.ARCHIVED;

    await this.AssetRepo.save(asset);

    await this.invalidateAssetCache(userId, id);

    /*    console.log('id: ', id);
    const asset = await this.AssetRepo.findOne({
      where: { id },
      relations: ['thumbnail'],
    });
    if (!asset) throw new BadRequestException('asset not found');
    const filePath = asset.storagePath;
    const thumbId = asset?.thumbnail?.id ? asset.thumbnail.id : null;

    await this.AssetRepo.remove(asset);
    if (thumbId) {
      await this.deleteFile(filePath, thumbId);
      await this.thumbnailService.deleteThumbEntity(thumbId);
    }

    await this.invalidateAssetCache(userId, id);
    */
  }

  async updateEntity(updateAssetDto: UpdateAssetDto, id: number) {
    await this.AssetRepo.update({ id }, updateAssetDto);
  }

  async updateAssetFile(
    file: Express.Multer.File | undefined,
    thumbnailFile: Express.Multer.File | undefined,
    oldFilePath: string,
    thumbId: number,
    id: number,
    userId: number,
    title: string,
    extension: string,
  ) {
    let newFilePath = oldFilePath;
    let newExtension = extension;

    // Only handle primary file upload if a new file was actually provided
    if (file) {
      await this.deleteFile(oldFilePath, thumbId);
      const {
        mimeType,
        extension: ext,
        filePath,
      } = await this.uploadFile(file, userId);
      newFilePath = filePath;
      newExtension = ext;
    }

    // Process the thumbnail using the new hybrid flow
    const thumbnail = await this.thumbnailService.updateThumbEntity(
      thumbId,
      file,
      thumbnailFile,
      title,
      newExtension,
      userId,
      this.supabase,
    );

    // Commit the new file and thumbnail relationships
    await this.AssetRepo.update(
      { id },
      {
        fileExtension: newExtension,
        storagePath: newFilePath,
        thumbnail: thumbnail ? { id: thumbnail.id } : undefined,
      },
    );
  }

  async updateAsset(
    id: number,
    updateAssetDto: UpdateAssetDto,
    userId: number,
    file?: Express.Multer.File,
    thumbnailFile?: Express.Multer.File,
  ) {
    const asset = await this.AssetRepo.findOne({
      where: { id },
      relations: ['thumbnail', 'creator'],
    });
    if (!asset || !asset.thumbnail)
      throw new BadRequestException('file not found');

    const filePath = asset.storagePath;
    const thumbId = asset.thumbnail?.id;

    // Derive the title (from DTO if updated, otherwise fallback to existing)
    const title = updateAssetDto.title || asset.title || 'ASSET';
    const extension = asset.fileExtension;

    // Only run file/thumbnail updates if one of the files was actually provided
    if (file || thumbnailFile) {
      await this.updateAssetFile(
        file,
        thumbnailFile,
        filePath,
        thumbId,
        id,
        userId,
        title,
        extension,
      );
    }

    await this.updateEntity(updateAssetDto, id);
    await this.invalidateAssetCache(userId, id);
    return this.AssetRepo.findOne({ where: { id }, relations: ['thumbnail'] });
  }
  async findByCreator(
    id: number,
    isOwner: boolean,
    page: number,
    limit: number,
  ) {
    const cacheKey = `creator:${id}:owner=${isOwner}:page=${page}:limit=${limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const skip = (page - 1) * limit;
    const [data, total] = await this.AssetRepo.findAndCount({
      where: {
        creator: { id: id },
        status: isOwner
          ? In([AssetStatus.DRAFT, AssetStatus.PUBLISHED, AssetStatus.BANNED])
          : AssetStatus.PUBLISHED,
      },
      relations: ['thumbnail'],
      take: limit,
      skip: skip,
      order: { updateAT: 'DESC' },
    });
    const result = { data, total };
    await this.cacheManager.set(cacheKey, result, 30);

    return result;
  }

  async findWishlist(assetId: number) {
    const asset = await this.AssetRepo.findOne({
      where: { id: assetId },
      relations: ['wishlist'],
    });

    return asset;
  }

  async createCheckoutSessionAsset(userId: number, assetId: number) {
    const asset = await this.AssetRepo.findOne({
      where: { id: assetId },
      relations: ['creator'],
      select: {
        id: true,
        title: true,
        price: true,
        creator: {
          id: true,
          role: true,
          onboardingStatus: true,
          stripeAccountId: true,
          firstName: true,
        },
      },
    });
    if (!asset) throw new BadRequestException('asset not found');
    if (userId === asset.creator.id)
      throw new BadRequestException('cant purchase your own asset');
    if (
      asset.creator.onboardingStatus !== OnboardingStatus.ACTIVE ||
      !asset.creator.stripeAccountId
    ) {
      throw new BadRequestException(
        'This seller is not onboarded to receive payments yet.',
      );
    }
    return await this.orderService.createCheckoutSession(
      userId,
      assetId,
      asset.price,
      asset.creator.stripeAccountId,
      asset.title,
      asset.creator.firstName,
      asset.creator.id,
    );
  }

  async getDownloadUrl(assetId: number, userId: number) {
    const order = await this.orderService.findOrder(userId, assetId);
    if (!order || order.status === OrderStatus.REFUNDED)
      throw new ForbiddenException(
        'You must purchase this item to download it',
      );
    //check if the asset exists
    const asset = await this.AssetRepo.findOneBy({ id: assetId });
    if (!asset) throw new NotFoundException('asset not found');

    const bucket = this.configService.get('supabase.assetBucket');

    const { error, data } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(asset.storagePath, 100, {
        download: true,
      });
    if (error)
      throw new BadRequestException('Could not generate download link');

    return { downloadUrl: data.signedUrl };
  }

  async publishAsset(assetId: number, userId: number) {
    const asset = await this.AssetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new BadRequestException('asset not found');

    if (asset.status === AssetStatus.DRAFT) {
      asset.status = AssetStatus.PUBLISHED;
    } else if (asset.status === AssetStatus.PUBLISHED) {
      asset.status = AssetStatus.DRAFT;
    } else {
      return;
    }

    await this.AssetRepo.save(asset);

    await this.invalidateAssetCache(userId, assetId);
  }

  async getPublicCreatorProfile(
    creatorId: number,
    page: number,
    limit: number,
  ) {
    const cacheKey = `Profile:${creatorId}:page=${page}:limit=${limit}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const skip = (page - 1) * limit;

    const creator = await this.userRepo.findOne({
      where: { id: creatorId },
      select: ['id', 'firstName', 'lastName', 'avatarUrl', 'createdAt'],
    });

    if (!creator) throw new NotFoundException('Creator not found');

    // 💡 Use findAndCount to get the total number of items ignoring pagination bounds
    const [assets, totalActiveAssets] = await this.AssetRepo.findAndCount({
      where: { creator: { id: creatorId }, status: AssetStatus.PUBLISHED },
      relations: ['thumbnail'],
      take: limit,
      skip: skip,
      order: { createdAt: 'DESC' },
    });

    const totalSalesCount = await this.orderRepo.count({
      where: { seller: { id: creatorId } },
    });

    const result = {
      creator,
      metrics: {
        activeAssetsCount: totalActiveAssets, // 💡 Displays true overall count accurately
        totalSalesCount,
      },
      assets: assets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        description: asset.description,
        price: asset.price,
        fileExtension: asset.fileExtension,
        thumbnailUrl: asset.thumbnail?.url || null,
      })),
      pagination: {
        currentPage: page,
        limit,
        totalItems: totalActiveAssets,
        totalPages: Math.ceil(totalActiveAssets / limit),
      },
    };

    await this.cacheManager.set(cacheKey, result, 300000); // Cache for 5 mins
    return result;
  }

async invalidateAssetCache(userId: number, assetId?: number) {
    const patterns = [
      `*creator:${userId}:*`,       // Added leading * for cache-manager prefixes
      `*asset/mine*`,               // Catches Controller-level CacheInterceptor routes
      `*asset/user/${userId}*`,     // Catches Controller-level CacheInterceptor routes
      `*assets:*`,                  // Catches global findAll feed
      `*Profile:${userId}:*`,       // Added leading * 
    ];

    if (assetId) {
      // FIX: Use a colon to match the manual cacheKey from `findOne` -> `asset:123:user=456`
      patterns.push(`*asset:${assetId}*`); 
      
      // Keep this only if you ALSO use @CacheKey or CacheInterceptor on routes like /api/asset/123
      patterns.push(`*asset/${assetId}*`); 
    } 

    for (const pattern of patterns) {
      await new Promise<void>((resolve, reject) => {
        const stream = this.redis.scanStream({
          match: pattern,
          count: 100,
        });

        stream.on('data', async (keys: string[]) => {
          if (keys.length > 0) {
            console.log(`🔥 Actually deleting these keys from Redis:`, keys);
            stream.pause();
            try {
              await this.redis.del(...keys);
            } catch (err) {
              stream.destroy();
              return reject(err);
            }
            stream.resume();
          }
        });

        stream.on('error', (err) => {
          reject(err);
        });

        stream.on('end', () => {
          console.log(`Successfully evicted cache matching pattern: ${pattern}`);
          resolve();
        });
      });
    }
  }}
