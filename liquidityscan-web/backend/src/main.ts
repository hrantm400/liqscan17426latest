import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
// cookie-parser is CJS with `export = cookieParser;` in its d.ts, so the
// TS default-import compiles to `cookie_parser_1.default(...)` which is not
// a function. Use `require` style to get the callable directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as () => (req: any, res: any, next: any) => void;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

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
