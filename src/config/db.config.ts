import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',

    // 1. Priority: Use DATABASE_URL (Railway/Prod).
    // 2. Fallback: Build it from components (Local Docker).
    url: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10) || 5432,
    username: process.env.DB_USERNAME || 'user',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'assetflow',

    // SSL is required for Railway/Cloud DBs but usually not for Local Docker
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,

    // IMPORTANT: Professional standard
    synchronize: false,
    autoLoadEntities: true,

    //    logging: process.env.NODE_ENV === 'development',

    // Tell TypeORM where to find your migration files
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: true, // Auto-run pending migrations on app start
  }),
);
