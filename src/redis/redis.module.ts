import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { REDIS_CLIENT } from './constants/redis.client';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const isProd =
          configService.get<string>('redis.nodeEnv') === 'production';
        return new Redis({
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password') || undefined,
          tls: isProd ? {} : undefined,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async onApplicationShutdown() {
    await this.redisClient.quit();
    console.log(' Global Redis client disconnected gracefully.');
  }
}
