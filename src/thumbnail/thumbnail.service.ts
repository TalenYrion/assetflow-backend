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
    let isAnimated = false;

    if (file.mimetype.startsWith('video/')) {
      // Use the new clip extractor
      imageBuffer = await this.extractVideoClip(file.buffer);
      isAnimated = true;
    } else if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException(
        'Unsupported file type for dynamic thumbnail',
      );
    }

    const { thumbPath, thumnUrl } = await this.createThumbFile(
      imageBuffer,
      userId,
      isAnimated
    );
    
    const newThumbnail = await this.thumbnailRepo.create({
      url: thumnUrl,
      storagePath: thumbPath,
    });
    await this.thumbnailRepo.save(newThumbnail);

    return newThumbnail;
  }

  private extractVideoClip(videoBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // 1. Create a unique temporary file path in WSL/tmp
      const tempInputPath = path.join(os.tmpdir(), `input-${Date.now()}.mp4`);
      const tempOutputPath = path.join(os.tmpdir(), `output-${Date.now()}.gif`);

      // 2. Write the video buffer to the temp file synchronously
      fs.writeFileSync(tempInputPath, videoBuffer);

      // 3. Run FFmpeg directly on the file system to extract a 3-second animated GIF
      Ffmpeg(tempInputPath)
        .seekInput('00:00:00.000') // Start at the beginning
        .duration(3) // Capture a 3-second clip
        .outputOptions([
          '-vf fps=10,scale=320:-1:flags=lanczos', // 10 frames per sec, 320px width (maintaining aspect ratio)
          '-loop 0'
        ])
        .toFormat('gif')
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
            // 4. Read the generated GIF frame clip into a buffer
            if (!fs.existsSync(tempOutputPath)) {
              throw new Error('Output clip file was not generated.');
            }
            const frameBuffer = fs.readFileSync(tempOutputPath);

            // 5. Clean up both temporary files completely
            fs.unlinkSync(tempInputPath);
            fs.unlinkSync(tempOutputPath);

            resolve(frameBuffer);
          } catch (error) {
            reject(
              new BadRequestException(
                `Failed to read extracted clip: ${error.message}`,
              ),
            );
          }
        })
        .run(); // Explicitly trigger execution
    });
  }

  async createThumbFile(buffer: Buffer, userId: number, isAnimated: boolean = false) {
    // Pass { animated: true } to sharp if it's a video clip so it processes all frames into an animated WebP
    const thumbnailBuffer = await sharp(buffer, { animated: isAnimated })
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
        const imageBuffer = await this.extractVideoClip(file.buffer);
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
    // Escape special characters to prevent invalid SVG XML
    const escapeXml = (unsafe: string) => {
      return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
    };

    const safeTitle = escapeXml(title);
    const displayTitle = safeTitle.length > 22 ? safeTitle.substring(0, 22) + '...' : safeTitle;

    // Generate a consistent but unique color scheme based on the title string
    const hash1 = Math.abs(title.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) % 360;
    const hash2 = (hash1 + 45) % 360;
    
    const svgString = `
      <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="hsl(${hash1}, 80%, 15%)" />
            <stop offset="100%" stop-color="hsl(${hash2}, 80%, 10%)" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#bg)" />
        <rect width="100%" height="100%" fill="url(#grid)" />

        <!-- Abstract Decorative Elements -->
        <circle cx="15%" cy="20%" r="300" fill="white" opacity="0.02" />
        <circle cx="85%" cy="80%" r="400" fill="black" opacity="0.1" />

        <g transform="translate(640, 360)">
          <rect x="-400" y="-100" width="800" height="200" rx="30" fill="black" opacity="0.3" />
          <rect x="-400" y="-100" width="800" height="200" rx="30" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2" />
          
          <!-- FIX: Removed system-ui/-apple-system, replaced with standard local fonts -->
          <text y="-10" font-size="72" font-weight="900" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" dominant-baseline="middle" filter="url(#glow)">
            ${displayTitle}
          </text>
          
          <rect x="-120" y="45" width="240" height="50" rx="25" fill="rgba(255,255,255,0.1)" />
          
          <!-- FIX: Added standard monospace fallbacks -->
          <text y="70" font-size="24" font-weight="bold" fill="#38bdf8" font-family="'Courier New', Courier, monospace" text-anchor="middle" dominant-baseline="middle" letter-spacing="4">
            .${extension.toUpperCase()}
          </text>
        </g>
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
