import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Trim } from '../common/validation';
import { SettingsService } from './settings.service';

export class CompanySettingsDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(30)
  taxNumber?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(30)
  crNumber?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsEmail({}, { each: true, message: 'إيميل غير صحيح' })
  @Type(() => String)
  emails?: string[];
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Printed on every invoice: any signed-in user may read it. */
  @Get('company')
  company() {
    return this.settings.company();
  }

  @Patch('company')
  @RequirePermissions('settings.manage')
  update(@CurrentUser() actor: AuthUser, @Body() dto: CompanySettingsDto) {
    return this.settings.updateCompany(actor, dto);
  }
}
