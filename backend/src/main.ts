import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  // NoSQL injection prevention - strips $ and . from req.body/query/params
  app.use(mongoSanitize());

  // CSRF protection - validate Origin header on mutating requests
  const configuredOrigin = configService.get<string>('frontendUrl');
  const allowedOrigin = configuredOrigin && configuredOrigin.length > 0
    ? configuredOrigin
    : undefined;
  app.use((req: any, res: any, next: any) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.headers.origin || req.headers.referer;
      // Allow requests with no origin (server-to-server, Postman, webhooks)
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

  const port = configService.get<number>('app.port') || 3000;

  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`API Prefix: ${configService.get<string>('app.apiPrefix')}`);
}

bootstrap();
