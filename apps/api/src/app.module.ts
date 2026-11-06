import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClearersModule } from './clearers/clearers.module';
import { ClientsModule } from './clients/clients.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { validateEnv } from './config/env.validation';
import { EmployeesModule } from './employees/employees.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    RolesModule,
    UsersModule,
    EmployeesModule,
    ClearersModule,
    ClientsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: PrismaExceptionFilter }],
})
export class AppModule {}
