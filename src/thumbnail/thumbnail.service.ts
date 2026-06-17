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
    file: Express.Multer.File,
    userId: number,
    supabase: SupabaseClient,
  ) {
    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');

    let thumnUrl: string;
    let thumbPath: string;

    // 1. Fetch the existing thumbnail so we can clean up old files in Supabase storage
    const oldThumbnail = await this.thumbnailRepo.findOne({ where: { id } });
    if (!oldThumbnail) {
      throw new NotFoundException(`Thumbnail with ID ${id} not found`);
    }

    if (isImage || isVideo) {
      // Handle dynamic generation for images/videos
      let imageBuffer = file.buffer;
      if (isVideo) {
        imageBuffer = await this.extractVideoFrame(file.buffer);
      }

      // Delete the old custom file from Supabase bucket to save space (skip if it was a static icon)
      if (oldThumbnail.storagePath !== 'static-fallback') {
        const bucket = this.configService.get('supabase.thumbBucket');
        await supabase.storage.from(bucket).remove([oldThumbnail.storagePath]);
      }

      const thumbResult = await this.createThumbFile(imageBuffer, userId);
      thumnUrl = thumbResult.thumnUrl;
      thumbPath = thumbResult.thumbPath;
    } else {
      // 2. If the user switched to a .zip/.pdf file, use your static fallback icons
      if (oldThumbnail.storagePath !== 'static-fallback') {
        const bucket = this.configService.get('supabase.thumbBucket');
        await supabase.storage.from(bucket).remove([oldThumbnail.storagePath]);
      }

      // Map to your existing fallback helper
      thumnUrl = this.getFallbackIconsUrl(file.mimetype);
      thumbPath = 'static-fallback';
    }

    // 3. Commit the updated records to your database
    await this.thumbnailRepo.update(
      { id },
      { url: thumnUrl, storagePath: thumbPath },
    );

    return this.thumbnailRepo.findOne({ where: { id } });
  }

  getFallbackIconsUrl(mimeType: string): string {
    const iconsBaseUrl =
      'https://auffenstcauzqynjbmps.supabase.co/storage/v1/object/public/static-icons';

    if (mimeType === 'application/pdf') {
      return `${iconsBaseUrl}/pdf-icon.svg`;
    }
    if (
      mimeType === 'application/zip' ||
      mimeType === 'application/x-zip-compressed'
    ) {
      return `${iconsBaseUrl}/zip-icon.svg`;
    }
    if (mimeType.startsWith('audio/')) {
      return `${iconsBaseUrl}/audio-icon.svg`;
    }
    if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return `${iconsBaseUrl}/word-icon.svg`; // Target extra type 1 (Word Docs)
    }
    if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return `${iconsBaseUrl}/excel-icon.svg`; // Target extra type 2 (Excel)
    }

    // Absolute fallback for anything else
    return `${iconsBaseUrl}/others-icon.svg`;
  }

  async createStaticThumbnail(url: string): Promise<Thumbnail> {
    const thumbnail = this.thumbnailRepo.create({
      url: url,
      storagePath: 'static-fallback',
    });
    return await this.thumbnailRepo.save(thumbnail);
  }
}
