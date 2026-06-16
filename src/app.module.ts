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
      isGlobal: true,
      load: [dbConfig, subabaseConfig, orderConfig, redisConfig],
      //      validationSchema: envValidationSchema,
    }),

    // 2. Async TypeORM Connection
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...config.get('database'), // This gets our 'database' registerAs object
        autoLoadEntities: true, // Automatically finds your @Entity files
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password') || undefined,

          // 1. CRITICAL: BullMQ will crash instantly on startup without this
          maxRetriesPerRequest: null,

          // 2. REQUIRED: Upstash requires TLS (SSL) encryption when connecting over the public internet
          tls:
            config.get<string>('redis.nodeEnv') === 'production'
              ? {}
              : undefined,
        },
      }),
    }),

    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const host = config.get<string>('redis.host');
        const port = config.get<number>('redis.port');
        const password = config.get<string>('redis.password');

        // 1. Dynamically select 'rediss' for TLS in production
        const isProd = config.get<string>('redis.nodeEnv') === 'production';
        const protocol = isProd ? 'rediss' : 'redis';

        // 2. Build the connection URI using the dynamic protocol
        const redisUri = password
          ? `${protocol}://:${password}@${host}:${port}`
          : `${protocol}://${host}:${port}`;

        return {
          stores: [new KeyvRedis(redisUri)],
          ttl: 300000, // 5 minutes in milliseconds
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
