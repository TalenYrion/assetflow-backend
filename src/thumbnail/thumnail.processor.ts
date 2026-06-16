import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Asset } from 'src/entity/asset.entity';
import { Repository } from 'typeorm';
import { ThumbnailService } from './thumbnail.service';
import { Job } from 'bullmq';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Processor('thumbnail-process')
export class ThumbnailProcessor extends WorkerHost {
  private supabase: SupabaseClient;
  constructor(
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    private thumbnailService: ThumbnailService,
    private configService: ConfigService,
  ) {
    super();
    const url = this.configService.get('supabase.url');
    const key = this.configService.get('supabase.key');
    if (!url || !key) {
      throw new Error('Supabase URL or Key is missing in configuration');
    }

    this.supabase = createClient(url, key);
  }

  async process(
    job: Job<{ assetId: number; storagePath: string; userId: number }>,
  ): Promise<any> {
    const { assetId, storagePath, userId } = job.data;
    const bucket = this.configService.get('supabase.assetBucket');

    try {
      console.log(`[Worker] Processing thumbnail for Asset #${assetId}`);

      const { data, error } = await this.supabase.storage
        .from(bucket)
        .download(storagePath);
      if (error || !data) {
        throw new Error(`Failed to download private asset: ${error?.message}`);
      }

      const videoBuffer = Buffer.from(await data.arrayBuffer());

      const frameBuffer =
        await this.thumbnailService['extractVideoFrame'](videoBuffer);

      const { thumnUrl, thumbPath } =
        await this.thumbnailService.createThumbFile(frameBuffer, userId);

      const newThumbnail = await this.thumbnailService['thumbnailRepo'].create({
        url: thumnUrl,
        storagePath: thumbPath,
      });
      await this.thumbnailService['thumbnailRepo'].save(newThumbnail);
      await this.assetRepo.update(assetId, {
        thumbnail: newThumbnail,
      });
      console.log(
        `[Worker] Successfully attached thumbnail to Asset #${assetId}`,
      );
    } catch (err) {
      console.error(
        `[Worker Error] Failed to process job ${job.id}:`,
        err.message,
      );
      throw err;
    }
  }
}
