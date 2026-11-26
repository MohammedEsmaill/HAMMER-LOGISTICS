import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Trim } from '../common/validation';
import { FiscalMonthsService } from './fiscal-months.service';

class ReopenMonthDto {
  @Trim()
  @IsString()
  @MinLength(5, { message: 'اكتب سبب الفتح (5 حروف على الأقل)' })
  @MaxLength(500)
  reason!: string;
}

/** Closing the months: the accounts manager closes, the CEO alone reopens. */
@Controller('finance/months')
export class FiscalMonthsController {
  constructor(private readonly months: FiscalMonthsService) {}

  @Get()
  @RequireAnyPermission('finance.gl.view', 'finance.months.close')
  list() {
    return this.months.list();
  }

  @Get(':month/check')
  @RequirePermissions('finance.months.close')
  check(@Param('month') month: string) {
    return this.months.check(month);
  }

  @Post(':month/close')
  @RequirePermissions('finance.months.close')
  close(@CurrentUser() actor: AuthUser, @Param('month') month: string) {
    return this.months.close(actor, month);
  }

  @Post(':month/reopen')
  @RequirePermissions('finance.months.close')
  reopen(@CurrentUser() actor: AuthUser, @Param('month') month: string, @Body() dto: ReopenMonthDto) {
    return this.months.reopen(actor, month, dto.reason);
  }
}
