import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import {
  CreateBankAccountDto,
  LedgerQueryDto,
  UpdateAccountDto,
} from './dto/account.dto';
import { MoneyAccountsService } from './money-accounts.service';

@Controller('finance/accounts')
export class MoneyAccountsController {
  constructor(private readonly accounts: MoneyAccountsService) {}

  /** Who records movements needs the accounts to pick from, with their balances. */
  @Get()
  @RequireAnyPermission(
    'finance.balances.view',
    'finance.movements.create',
    'finance.accounts.manage',
  )
  list() {
    return this.accounts.list();
  }

  @Post()
  @RequirePermissions('finance.accounts.manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBankAccountDto) {
    return this.accounts.createBank(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('finance.accounts.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(actor, id, dto);
  }

  @Get(':id/movements')
  @RequirePermissions('finance.balances.view')
  ledger(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: LedgerQueryDto,
  ) {
    return this.accounts.ledger(id, query);
  }
}
