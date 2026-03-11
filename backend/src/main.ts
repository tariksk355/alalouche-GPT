import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('');
  app.enableCors({
    origin: true,
    // credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'x-restaurant-id', 'x-restaurant-slug'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
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