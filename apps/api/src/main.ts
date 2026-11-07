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
  // behind Vercel's rewrite and the host's load balancer: the client IP (rate limits,
  // audit) is the one they forward, counted from the right
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (hops > 0) {
    (app as unknown as { set: (k: string, v: number) => void }).set(
      'trust proxy',
      hops,
    );
  }
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
