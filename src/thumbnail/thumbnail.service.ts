import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg'; // 👈 1. Add this import
import sharp from 'sharp';
import { Thumbnail } from 'src/entity/thumbnail.entity';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

Ffmpeg.setFfmpegPath(ffmpegPath);

@Injectable()
export class ThumbnailService {
  private supabase: SupabaseClient;

  constructor(
    @InjectRepository(Thumbnail) private thumbnailRepo: Repository<Thumbnail>,
    private configService: ConfigService,
  ) {
    const url = this.configService.get('supabase.url');
    const key = this.configService.get('supabase.key');

    if (!url || !key) {
      throw new Error('Supabase URL or Key is missing in configuration');
    }
    this.supabase = createClient(url, key);
  }

  async createThumbnail(file: Express.Multer.File, userId: number) {
    let imageBuffer = file.buffer;
    if (file.mimetype.startsWith('video/')) {
      imageBuffer = await this.extractVideoFrame(file.buffer);
    } else if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException(
        'Unsupported file type for dynamic thumbnail',
      );
    }

    const { thumbPath, thumnUrl } = await this.createThumbFile(
      imageBuffer,
      userId,
    );
    const newThumbnail = await this.thumbnailRepo.create({
      url: thumnUrl,
      storagePath: thumbPath,
    });
    await this.thumbnailRepo.save(newThumbnail);

    return newThumbnail;
  }

  private extractVideoFrame(videoBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // 1. Create a unique temporary file path in WSL
      const tempInputPath = path.join(os.tmpdir(), `input-${Date.now()}.mp4`);
      const tempOutputPath = path.join(os.tmpdir(), `output-${Date.now()}.jpg`);

      // 2. Write the video buffer to the temp file synchronously
      fs.writeFileSync(tempInputPath, videoBuffer);

      // 3. Run FFmpeg directly on the file system
      Ffmpeg(tempInputPath)
        .seekInput('00:00:01.000') // Capture frame at 1-second mark
        .outputOptions(['-vframes 1', '-vcodec mjpeg'])
        .output(tempOutputPath)
        .on('error', (err) => {
          // Clean up input file if it fails
          if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
          reject(
            new BadRequestException(`FFmpeg process failed: ${err.message}`),
          );
        })
        .on('end', () => {
          try {
            // 4. Read the generated frame into a buffer
            if (!fs.existsSync(tempOutputPath)) {
              throw new Error('Output frame file was not generated.');
            }
            const frameBuffer = fs.readFileSync(tempOutputPath);

            // 5. Clean up both temporary files completely
            fs.unlinkSync(tempInputPath);
            fs.unlinkSync(tempOutputPath);

            resolve(frameBuffer);
          } catch (error) {
            reject(
              new BadRequestException(
                `Failed to read extracted frame: ${error.message}`,
              ),
            );
          }
        })
        .run(); // Explicitly trigger execution
    });
  }
  async createThumbFile(buffer: Buffer, userId: number) {
    const thumbnailBuffer = await sharp(buffer)
      .resize(300, 300, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    const thumbPath = `user-${userId}/thumb-${Date.now()}.webp`;
    const bucket = this.configService.get('supabase.thumbBucket');

    await this.supabase.storage
      .from(bucket)
      .upload(thumbPath, thumbnailBuffer, { contentType: 'image/webp' });

    const {
      data: { publicUrl: thumnUrl },
    } = this.supabase.storage.from(bucket).getPublicUrl(thumbPath);
    return {
      thumnUrl,
      thumbPath,
    };
  }

  async deleteThumnFile(supabase: SupabaseClient, id: number) {
    const bucket = this.configService.get('supabase.thumbBucket');
    const thumbnail = await this.thumbnailRepo.findOne({ where: { id } });
    if (!thumbnail) throw new BadRequestException('thumbnail is not found');
    const filePath = thumbnail.storagePath;
    await supabase.storage.from(bucket).remove([filePath]);
  }

  async deleteThumbEntity(thumbId: number) {
    await this.thumbnailRepo.delete(thumbId);
  }

  async updateThumbEntity(
    id: number,
    file: Express.Multer.File | undefined,
    thumbnailFile: Express.Multer.File | undefined,
    title: string,
    extension: string,
    userId: number,
    supabase: SupabaseClient,
  ) {
    const oldThumbnail = await this.thumbnailRepo.findOne({ where: { id } });
    if (!oldThumbnail)
      throw new NotFoundException(`Thumbnail with ID ${id} not found`);

    let thumnUrl: string = oldThumbnail.url;
    let thumbPath: string = oldThumbnail.storagePath;

    // 1. Determine which thumbnail to generate based on hybrid priority
    if (thumbnailFile) {
      // User explicitly uploaded a new cover image
      const webpBuffer = await this.generateCustomThumbBuffer(thumbnailFile);
      const result = await this.uploadToBucket(webpBuffer, userId);
      thumnUrl = result.thumnUrl;
      thumbPath = result.thumbPath;
    } else if (file) {
      // User uploaded a new file without a cover image
      if (file.mimetype.startsWith('video/')) {
        const imageBuffer = await this.extractVideoFrame(file.buffer);
        const result = await this.createThumbFile(imageBuffer, userId); // Or reuse uploadToBucket if appropriate
        thumnUrl = result.thumnUrl;
        thumbPath = result.thumbPath;
      } else if (file.mimetype.startsWith('image/')) {
        const result = await this.createThumbFile(file.buffer, userId);
        thumnUrl = result.thumnUrl;
        thumbPath = result.thumbPath;
      } else {
        // Fallback to data-driven SVG banner
        const webpBuffer = await this.generateDynamicThumbBuffer(
          title,
          extension,
        );
        const result = await this.uploadToBucket(webpBuffer, userId);
        thumnUrl = result.thumnUrl;
        thumbPath = result.thumbPath;
      }
    } else {
      // No file or thumbnailFile uploaded, safely skip changes
      return oldThumbnail;
    }

    // 2. Clean up old file from Supabase Bucket (if it changed)
    if (
      oldThumbnail.storagePath !== 'static-fallback' &&
      oldThumbnail.storagePath !== thumbPath
    ) {
      const bucket = this.configService.get('supabase.thumbBucket');
      await supabase.storage.from(bucket).remove([oldThumbnail.storagePath]);
    }

    // 3. Update existing DB Entity with the new paths
    await this.thumbnailRepo.update(
      { id },
      { url: thumnUrl, storagePath: thumbPath },
    );

    return this.thumbnailRepo.findOne({ where: { id } });
  }

  private async uploadToBucket(
    buffer: Buffer,
    userId: number,
    contentType: string = 'image/webp',
  ) {
    const thumbPath = `user-${userId}/thumb-${Date.now()}.webp`;
    const bucket = this.configService.get('supabase.thumbBucket');

    await this.supabase.storage
      .from(bucket)
      .upload(thumbPath, buffer, { contentType });

    const {
      data: { publicUrl: thumnUrl },
    } = this.supabase.storage.from(bucket).getPublicUrl(thumbPath);

    return { thumnUrl, thumbPath };
  }

  async generateCustomThumbBuffer(file: Express.Multer.File): Promise<Buffer> {
    return sharp(file.buffer)
      .resize({ width: 1280, height: 720, fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
  }

  async generateDynamicThumbBuffer(
    title: string,
    extension: string,
  ): Promise<Buffer> {
    const svgString = `
      <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1e293b" />
        <text x="50%" y="45%" font-size="80" fill="#ffffff" font-family="Arial" text-anchor="middle" dominant-baseline="middle">
          ${title}
        </text>
        <text x="50%" y="60%" font-size="40" fill="#94a3b8" font-family="Arial" text-anchor="middle" dominant-baseline="middle">
          FILE EXTENSION: .${extension.toUpperCase()}
        </text>
      </svg>
    `;
    return sharp(Buffer.from(svgString))
      .resize(1280, 720)
      .webp({ quality: 80 })
      .toBuffer();
  }

  async processCustomThumbnail(
    file: Express.Multer.File,
    userId: number,
  ): Promise<Thumbnail> {
    const webpBuffer = await this.generateCustomThumbBuffer(file);
    const { thumnUrl, thumbPath } = await this.uploadToBucket(
      webpBuffer,
      userId,
    );

    const newThumbnail = this.thumbnailRepo.create({
      url: thumnUrl,
      storagePath: thumbPath,
    });
    return await this.thumbnailRepo.save(newThumbnail);
  }

  async generateDynamicThumbnail(
    title: string,
    extension: string,
    userId: number,
  ): Promise<Thumbnail> {
    const webpBuffer = await this.generateDynamicThumbBuffer(title, extension);
    const { thumnUrl, thumbPath } = await this.uploadToBucket(
      webpBuffer,
      userId,
    );

    const newThumbnail = this.thumbnailRepo.create({
      url: thumnUrl,
      storagePath: thumbPath,
    });
    return await this.thumbnailRepo.save(newThumbnail);
  }
}
