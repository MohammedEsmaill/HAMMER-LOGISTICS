import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConfig } from './config/env.validation';

/** Shared by main.ts and the e2e tests so both run the same pipeline. */
export function configureApp(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  webOrigin: string,
) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({ origin: webOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppConfig, true>);
  configureApp(app, config.get('WEB_ORIGIN', { infer: true }));
  await app.listen(config.get('PORT', { infer: true }));
}

if (require.main === module) {
  void bootstrap();
}
