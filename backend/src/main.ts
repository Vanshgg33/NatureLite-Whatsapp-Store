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

  // CSRF protection - validate Origin header on mutating requests
  const configuredOrigin = configService.get<string>('frontendUrl');
  const allowedOrigin =
    configuredOrigin && configuredOrigin.length > 0 ? configuredOrigin : undefined;
  app.use((req: any, res: any, next: any) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.headers.origin || req.headers.referer;
      if (allowedOrigin && origin && !origin.startsWith(allowedOrigin)) {
        return res.status(403).json({ message: 'CSRF validation failed' });
      }
    }
    next();
  });

  app.enableCors({
    origin: allowedOrigin || true,
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
