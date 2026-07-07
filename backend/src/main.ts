import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { WhatsAppConfig } from './config/configuration';

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');

const logger = new Logger('Bootstrap');

// Promise-based singleton: ensures concurrent cold-start requests share the same
// initialization promise so only one NestJS instance is ever bootstrapped (BUG 15 fix).
let serverInitPromise: Promise<any> | null = null;

function getOrCreateServer(): Promise<any> {
  if (!serverInitPromise) {
    serverInitPromise = createApp().then(({ app, configService }) => {
      const server = app.getHttpAdapter().getInstance();
      logger.log(
        `Nest initialized. API: ${configService.get<string>('app.apiPrefix')}`,
      );
      return server;
    });
  }
  return serverInitPromise;
}

function validateProductionConfig(configService: ConfigService): void {
  const nodeEnv = configService.get<string>('app.nodeEnv');

  // JWT_SECRET is critical in every environment — a missing or empty secret
  // allows unauthenticated access to all protected endpoints.
  const jwtSecret = configService.get<string>('jwt.secret') || '';
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable must be set.');
  }

  if (nodeEnv !== 'production') {
    return;
  }

  const frontendUrl = configService.get<string>('frontendUrl') || '';
  const whatsapp = configService.get<WhatsAppConfig>('whatsapp');

  const errors: string[] = [];

  if (!frontendUrl.trim()) {
    errors.push('FRONTEND_URL is required in production.');
  }

  const provider = whatsapp?.provider;
  const apiUrl = whatsapp?.apiUrl || '';
  const d360ApiKey = whatsapp?.d360ApiKey || '';
  const accessToken = whatsapp?.accessToken || '';
  const phoneNumberId = whatsapp?.phoneNumberId || '';

  if (whatsapp?.provider === '360dialog_sandbox') {
    errors.push('WHATSAPP_PROVIDER cannot be 360dialog_sandbox in production. Use 360dialog for live usage.');
  }

  if (provider === '360dialog') {
    if (!d360ApiKey.trim()) {
      errors.push('WHATSAPP_D360_API_KEY is required when WHATSAPP_PROVIDER=360dialog.');
    }
    if (apiUrl.includes('waba-sandbox.360dialog.io')) {
      errors.push('WHATSAPP_API_URL points to sandbox. Use a 360dialog production API URL in production.');
    }
  }

  if (provider === 'meta') {
    if (!accessToken.trim()) {
      errors.push('WHATSAPP_ACCESS_TOKEN is required when WHATSAPP_PROVIDER=meta.');
    }
    if (!phoneNumberId.trim()) {
      errors.push('WHATSAPP_PHONE_NUMBER_ID is required when WHATSAPP_PROVIDER=meta.');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration validation failed: ${errors.join(' ')}`);
  }
}

async function createApp() {
  // Register body parsers on the raw Express instance BEFORE NestJS middleware
  // so the 100 MB limit (matching the old rawBody:true default) is always applied.
  const server = express();

  server.use(
    bodyParser.json({
      limit: '100mb',
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  server.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

  // Pass our pre-configured Express instance to NestJS and disable its
  // built-in body parser so it never re-registers one with the default limit.
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
    rawBody: false,
  });

  const configService = app.get(ConfigService);
  validateProductionConfig(configService);

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
    // Never reflect arbitrary origins with credentials — fall back to no CORS
    // rather than an open wildcard when FRONTEND_URL is not configured.
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
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

// Serverless handler: each request goes through the singleton server
export default async function handler(req: any, res: any) {
  const server = await getOrCreateServer();
  return server(req, res);
}

// Local dev: run HTTP server
if (!process.env.VERCEL) {
  (async () => {
    const { app, configService } = await createApp();
    const port = configService.get<number>('app.port');
    await app.listen(port);
  })();
}
