import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { WhatsAppConfig } from './config/configuration';

const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');

const logger = new Logger('Bootstrap');

let cachedServer: any;

function validateProductionConfig(configService: ConfigService): void {
  const nodeEnv = configService.get<string>('app.nodeEnv');
  if (nodeEnv !== 'production') {
    return;
  }

  const jwtSecret = configService.get<string>('jwt.secret') || '';
  const frontendUrl = configService.get<string>('frontendUrl') || '';
  const whatsapp = configService.get<WhatsAppConfig>('whatsapp');

  const errors: string[] = [];

  if (!frontendUrl.trim()) {
    errors.push('FRONTEND_URL is required in production.');
  }

  if (!jwtSecret || jwtSecret === 'default-secret-change-me') {
    errors.push('JWT_SECRET must be set to a strong non-default value in production.');
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
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  validateProductionConfig(configService);

  app.use(compression());
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
    logger.log(
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
