import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  ACCESS_TOKEN_TTL_SECONDS: number = 900;

  @IsOptional()
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS: number = 7;

  @IsOptional()
  @IsString()
  WEB_ORIGIN: string = 'http://localhost:5173';

  @IsOptional()
  @IsBooleanString()
  COOKIE_SECURE: string = 'false';

  @IsOptional()
  @IsInt()
  PORT: number = 3000;

  /** Proxies in front of the API in production (Vercel rewrite + host load balancer). */
  @IsOptional()
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS: number = 0;

  /** cloudinary://API_KEY:API_SECRET@CLOUD_NAME — needed only for document uploads. */
  @IsOptional()
  @IsString()
  CLOUDINARY_URL?: string;

  /** Without CLOUDINARY_URL, uploads are kept on this server's disk, in this folder. */
  @IsOptional()
  @IsString()
  UPLOAD_DIR: string = 'uploads';

  /** Where the linked WhatsApp session is kept (secret: never commit it). */
  @IsOptional()
  @IsString()
  WA_AUTH_DIR: string = 'whatsapp-auth';

  /** Where the database backups are kept. */
  @IsOptional()
  @IsString()
  BACKUP_DIR: string = 'backups';

  /** How many backups to keep. */
  @IsOptional()
  @IsInt()
  @Min(3)
  BACKUP_KEEP: number = 30;

  /** A second folder every backup is copied to (a USB stick, OneDrive...). */
  @IsOptional()
  @IsString()
  BACKUP_COPY_DIR?: string;

  /** How pg_dump runs: on this machine, inside the docker database, or whichever works. */
  @IsOptional()
  @IsIn(['auto', 'local', 'docker'])
  BACKUP_PG: 'auto' | 'local' | 'docker' = 'auto';

  /** The docker compose file of the database (docker mode). */
  @IsOptional()
  @IsString()
  BACKUP_COMPOSE_FILE?: string;
}

export type AppConfig = EnvironmentVariables;

export function validateEnv(config: Record<string, unknown>): AppConfig {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment: ${errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`,
    );
  }
  return validated;
}
