import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

function validateRuntimeConfig() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');

  if (process.env.NODE_ENV === 'production' && !process.env.AUTH_TOKEN_SECRET) {
    missing.push('AUTH_TOKEN_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  validateRuntimeConfig();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('');

  app.use((req: Request, res: Response, next: () => void) => {
    const requestId = req.header('x-request-id') || randomUUID();
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
      logger.log(
        JSON.stringify({
          event: 'http_request',
          requestId,
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    next();
  });

  app.enableCors({
    origin: true,
    // credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-restaurant-id', 'x-restaurant-slug', 'x-request-id'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = Number(process.env.PORT || 3000);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }
  await app.listen(port, '0.0.0.0');
  logger.log(
    JSON.stringify({
      event: 'startup',
      status: 'ok',
      port,
      nodeEnv: process.env.NODE_ENV || 'development',
    }),
  );
}

bootstrap();

// import 'reflect-metadata';
// import { ValidationPipe } from '@nestjs/common';
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { AllExceptionsFilter } from './common/all-exceptions.filter';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule, { bufferLogs: true });

//   app.enableCors({
//     origin: true,
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-restaurant-id', 'x-restaurant-slug'],
//   });

//   app.setGlobalPrefix('');
//   app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
//   app.useGlobalFilters(new AllExceptionsFilter());
//   const port = Number(process.env.PORT || 3000);
//   await app.listen(port, '0.0.0.0');

//   console.log(`Backend listening on http://0.0.0.0:${port}`);
// }

// bootstrap();
