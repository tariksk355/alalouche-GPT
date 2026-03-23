import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

const DISALLOWED_PRODUCTION_SECRETS = new Set(['dev-auth-token-secret', 'replace-me', 'changeme', 'change-me']);
const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function normalizeNodeEnv(): 'production' | 'development' | 'test' {
  const raw = (process.env.NODE_ENV || 'development').trim().toLowerCase();
  if (raw === 'production' || raw === 'test') {
    return raw;
  }

  return 'development';
}

function isSwaggerEnabled(nodeEnv: 'production' | 'development' | 'test') {
  const enableSwagger = (process.env.ENABLE_SWAGGER || '').trim().toLowerCase() === 'true';
  return nodeEnv !== 'production' || enableSwagger;
}

function parseCorsAllowedOrigins(nodeEnv: 'production' | 'development' | 'test'): true | string[] {
  const raw = (process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (!raw) {
    if (nodeEnv === 'production') {
      throw new Error('Missing required environment variable: CORS_ALLOWED_ORIGINS');
    }

    return true;
  }

  const origins = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    if (nodeEnv === 'production') {
      throw new Error('CORS_ALLOWED_ORIGINS must include at least one explicit origin in production.');
    }

    return true;
  }

  if (nodeEnv === 'production' && origins.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS cannot contain * in production.');
  }

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }

    if (nodeEnv === 'production' && LOCALHOST_HOSTNAMES.has(parsed.hostname)) {
      throw new Error(`CORS_ALLOWED_ORIGINS cannot include localhost-style origins in production: ${origin}`);
    }
  }

  return origins;
}

function validateRuntimeConfig(nodeEnv: 'production' | 'development' | 'test') {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');

  const authTokenSecret = (process.env.AUTH_TOKEN_SECRET || '').trim();
  if (nodeEnv === 'production' && !authTokenSecret) {
    missing.push('AUTH_TOKEN_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (nodeEnv === 'production') {
    if (DISALLOWED_PRODUCTION_SECRETS.has(authTokenSecret.toLowerCase()) || authTokenSecret.length < 32) {
      throw new Error('AUTH_TOKEN_SECRET must be set to a strong, non-default value with at least 32 characters in production.');
    }

    if ((process.env.DEFAULT_RESTAURANT_ID || '').trim()) {
      throw new Error('DEFAULT_RESTAURANT_ID must not be set in production. It is a development-only fallback.');
    }
  }
}

async function bootstrap() {
  const nodeEnv = normalizeNodeEnv();
  validateRuntimeConfig(nodeEnv);
  const corsOrigin = parseCorsAllowedOrigins(nodeEnv);
  const enableSwagger = isSwaggerEnabled(nodeEnv);

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
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-restaurant-id', 'x-restaurant-slug', 'x-request-id'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('À la Louche API')
      .setDescription('Restaurant SaaS backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, swaggerDocument);
  }

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
      nodeEnv,
      corsMode: corsOrigin === true ? 'reflect-all' : 'explicit-list',
    }),
  );
}

bootstrap();
