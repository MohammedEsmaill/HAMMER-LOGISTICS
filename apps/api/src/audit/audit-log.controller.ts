import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Trim } from '../common/validation';
import { AuditLogService, SECTIONS } from './audit-log.service';

export class AuditQueryDto {
  @IsOptional()
  @IsIn(['operations', 'logins'])
  tab: 'operations' | 'logins' = 'operations';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  action?: string;

  @IsOptional()
  @IsIn(Object.keys(SECTIONS))
  section?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  entity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  entityId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** Up to 5000 for the Excel export. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  pageSize: number = 50;
}

/** The audit log: the CEO and the general auditor. */
@Controller('audit')
@RequirePermissions('audit.view')
export class AuditLogController {
  constructor(private readonly log: AuditLogService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() q: AuditQueryDto) {
    return this.log.list(actor, q);
  }

  @Get('users')
  users() {
    return this.log.users();
  }

  @Get('shipments/:id')
  ofShipment(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.log.ofShipment(actor, id);
  }
}
