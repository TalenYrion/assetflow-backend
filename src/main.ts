import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api');

  // Dynamically allow both your local machine and your production frontend
  const allowedOrigins = [
    'http://localhost:3001',
    process.env.FRONTEND_URL, // 👈 Add this environment variable in Render
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Render automatically assigns process.env.PORT, so this is perfect
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
