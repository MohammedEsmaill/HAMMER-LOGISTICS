import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Trim } from '../common/validation';
import { BankReconciliationService } from './bank-reconciliation.service';
import { PositiveMoney } from './money';

class ListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  accountId?: number;

  @IsOptional()
  @IsIn(['MATCHED', 'DIFFERENCE'])
  status?: 'MATCHED' | 'DIFFERENCE';
}

class DraftDto {
  @Type(() => Number)
  @IsInt()
  accountId!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

class SaveDto {
  /** the bank statement's balance at the period's end (may be below zero: an overdraft) */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  statementBalance!: number;

  @IsArray()
  @ArrayMaxSize(20000)
  @IsString({ each: true })
  clearedKeys!: string[];

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  bankLines?: unknown[];
}

class CreateDto extends SaveDto {
  @IsInt()
  accountId!: number;

  @Type(() => Date)
  @IsDate()
  from!: Date;

  @Type(() => Date)
  @IsDate()
  to!: Date;
}

class UpdateDto extends SaveDto {
  @IsInt()
  @Min(0)
  version!: number;
}

class RecordDto {
  @IsInt()
  accountId!: number;

  @IsIn(['BANK_CHARGES', 'INTEREST', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
  kind!: 'BANK_CHARGES' | 'INTEREST' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

  @PositiveMoney()
  amount!: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @Trim()
  @IsString()
  @MinLength(3, { message: 'اكتب البيان (3 حروف على الأقل)' })
  @MaxLength(300)
  reason!: string;
}

/** Bank reconciliation: the accountant, the treasury manager, the accounts manager, the CEO. */
@Controller('finance/reconciliations')
@RequirePermissions('finance.bank.reconcile')
export class BankReconciliationController {
  constructor(private readonly recon: BankReconciliationService) {}

  @Get()
  @RequireAnyPermission('finance.bank.reconcile', 'finance.gl.view')
  list(@Query() q: ListDto) {
    return this.recon.list(q.accountId, q.status);
  }

  @Get('accounts')
  @RequireAnyPermission('finance.bank.reconcile', 'finance.gl.view')
  accounts() {
    return this.recon.accounts();
  }

  @Get('draft')
  draft(@Query() q: DraftDto) {
    return this.recon.draft(q.accountId, q.from, q.to);
  }

  @Get(':id')
  @RequireAnyPermission('finance.bank.reconcile', 'finance.gl.view')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.recon.get(id);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateDto) {
    return this.recon.create(actor, dto);
  }

  @Put(':id')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDto) {
    const { version, ...input } = dto;
    return this.recon.update(actor, id, version, input);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.recon.remove(actor, id);
  }

  @Post('record')
  record(@CurrentUser() actor: AuthUser, @Body() dto: RecordDto) {
    return this.recon.record(actor, dto);
  }
}
