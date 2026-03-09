import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');

let cachedServer: any;

async function createApp() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.use(mongoSanitize());

  // CORS: support comma-separated FRONTEND_URL for multiple origins (e.g. prod + localhost)
  const frontendUrl = configService.get<string>('frontendUrl') || '';
  const allowedOrigins = frontendUrl
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // CSRF protection - validate Origin header on mutating requests
  app.use((req: any, res: any, next: any) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.headers.origin || req.headers.referer;
      if (allowedOrigins.length > 0 && origin) {
        const isAllowed = allowedOrigins.some((o) => origin.startsWith(o));
        if (!isAllowed) {
          return res.status(403).json({ message: 'CSRF validation failed' });
        }
      }
    }
    next();
  });

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });

  app.setGlobalPrefix(configService.get<string>('app.apiPrefix') || 'api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.init();
  return { app, configService };
}

// Vercel serverless: export handler for each request
export default async function handler(req: any, res: any) {
  if (!cachedServer) {
    const { app, configService } = await createApp();
    cachedServer = app.getHttpAdapter().getInstance();
    console.log(
      `Nest initialized (serverless). API: ${configService.get<string>('app.apiPrefix')}`,
    );
  }
  return cachedServer(req, res);
}

// Local dev: run HTTP server
if (!process.env.VERCEL) {
  (async () => {
    const { app, configService } = await createApp();
    const port = configService.get<number>('app.port');
    await app.listen(port);
    
  })();
}
