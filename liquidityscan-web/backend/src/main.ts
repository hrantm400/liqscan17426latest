import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : ['http://localhost:5173'];

  const enableCsp = process.env.HELMET_CSP === 'true';
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: enableCsp
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
              imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
              connectSrc: ["'self'", ...allowedOrigins],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://fast.wistia.net', 'https://fast.wistia.com'],
            },
          }
        : false,
    }),
  );

  // Enable CORS - restrict to frontend URL

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.LISTEN_HOST ?? '127.0.0.1';
  await app.listen(port, host);
  console.log(`🚀 Application is running on: http://${host}:${port}/api`);
}

bootstrap();
