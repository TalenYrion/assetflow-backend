import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import dbConfig from './config/db.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth/jwt-auth.guard';
import { RoleAuthGuard } from './auth/guards/role-auth/role-auth.guard';
import { AssetModule } from './asset/asset.module';
import subabaseConfig from './asset/config/subabase.config';
import { FileTypeModule } from './file-type/file-type.module';
import { ThumbnailModule } from './thumbnail/thumbnail.module';
import { OrderModule } from './order/order.module';
import orderConfig from './order/config/order.config';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { RedisModule } from './redis/redis.module';
import redisConfig from './redis/configs/redis.config';
import KeyvRedis from '@keyv/redis';

@Module({
imports: [
    // 1. Load & Validate Environment Variables
    ConfigModule.forRoot({
      envFilePath: 'app.env',
      // 👈 CRITICAL: Stops your local app.env from overriding production parameters on Render
      ignoreEnvFile: process.env.NODE_ENV === 'production' || !!process.env.RENDER, 
      isGlobal: true,
      load: [dbConfig, subabaseConfig, orderConfig, redisConfig],
    }),

    // 2. Async TypeORM Connection
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...config.get('database'),
        autoLoadEntities: true,
      }),
    }),

    // 3. Robust BullMQ Config
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Fallback checks to ensure production triggers correctly on Render
        const isProd = config.get<string>('redis.nodeEnv') === 'production' || !!process.env.RENDER;

        return {
          connection: {
            host: config.get<string>('redis.host'),
            port: config.get<number>('redis.port'),
            password: config.get<string>('redis.password') || undefined,
            maxRetriesPerRequest: null,
            // 👈 Explicitly configure TLS safely for production
            tls: isProd ? { rejectUnauthorized: false } : undefined, 
          },
        };
      },
    }),

    // 4. Robust CacheModule Config
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const host = config.get<string>('redis.host');
        const port = config.get<number>('redis.port');
        const password = config.get<string>('redis.password');

        // Fallback checks to ensure rediss:// runs on Render
        const isProd = config.get<string>('redis.nodeEnv') === 'production' || !!process.env.RENDER;
        const protocol = isProd ? 'rediss' : 'redis';

        const redisUri = password
          ? `${protocol}://:${password}@${host}:${port}`
          : `${protocol}://${host}:${port}`;

        return {
          stores: [new KeyvRedis(redisUri)],
          ttl: 300000, 
        };
      },
    }),
    UserModule,
    AuthModule,
    AssetModule,
    FileTypeModule,
    ThumbnailModule,
    RedisModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleAuthGuard },
  ],
})
export class AppModule {}
