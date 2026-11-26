import {
  Body,
  Controller,
  ForbiddenException,
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
import { BeneficiariesService } from './beneficiaries.service';
import { ClearerFeesService } from './clearer-fees.service';
import {
  BeneficiariesQueryDto,
  CreateBeneficiaryDto,
  UpdateBeneficiaryDto,
} from './dto/beneficiary.dto';
import { CustodiesService } from './custodies.service';
import {
  AdjustFeeDto,
  CustodiesQueryDto,
  FeesQueryDto,
  CancelCustodyDto,
  IssueCustodyDto,
  PayFeeDto,
  SettleCustodyDto,
  UpdateFeePaymentDto,
  UpdateIssueDto,
} from './dto/custody.dto';
import { ExpensesService } from './expenses.service';
import { HolderLedgerService } from './holder-ledger.service';

const READ = [
  'finance.custody.manage',
  'finance.custody.settle',
  'finance.fees.pay',
  'finance.ledgers.view',
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
  'finance.bank.record',
] as const;
/** Issuing: cash custodies the treasury manager; by bank the accountant too (the service checks). */
const ISSUE = ['finance.custody.manage', 'finance.bank.record'] as const;
/** Settling a custody: the accountant (or the CEO after approval). */
const SETTLE = ['finance.custody.settle', 'finance.approved.edit'] as const;
/** Paying clearers' fees: the treasury manager and the accounts manager. */
const PAY_FEES = [
  'finance.fees.pay',
  'finance.bank.record',
  'finance.approved.edit',
] as const;

@Controller('finance/custodies')
export class CustodiesController {
  constructor(
    private readonly custodies: CustodiesService,
    private readonly expenses: ExpensesService,
  ) {}

  /** The shipment expense types, for the settlement items. */
  @Get('expense-types')
  @RequireAnyPermission(...READ)
  types() {
    return this.expenses.types('SHIPMENT');
  }

  @Get()
  @RequireAnyPermission(...READ)
  list(@Query() q: CustodiesQueryDto) {
    return this.custodies.list(q);
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.custodies.get(id);
  }

  @Post()
  @RequireAnyPermission(...ISSUE)
  issue(@CurrentUser() actor: AuthUser, @Body() dto: IssueCustodyDto) {
    return this.custodies.issue(actor, dto);
  }

  /** Changing an open custody's data: the treasury manager only. */
  @Patch(':id')
  @RequirePermissions('finance.custody.manage')
  updateIssue(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.custodies.updateIssue(actor, id, dto);
  }

  /** Cancels an open custody: the whole amount back to where it came from. */
  @Post(':id/cancel')
  @RequirePermissions('finance.custody.manage')
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelCustodyDto,
  ) {
    return this.custodies.cancel(actor, id, dto);
  }

  /** Settles an open custody, or replaces the items of a settled one. */
  @Post(':id/settlement')
  @RequireAnyPermission(...SETTLE)
  settle(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SettleCustodyDto,
  ) {
    return this.custodies.settle(actor, id, dto);
  }
}

@Controller('finance/clearer-fees')
export class ClearerFeesController {
  constructor(private readonly fees: ClearerFeesService) {}

  @Get()
  @RequireAnyPermission(...READ)
  list(@Query() q: FeesQueryDto) {
    return this.fees.list(q);
  }

  @Get('payments/:id')
  @RequireAnyPermission(...READ)
  payment(@Param('id', ParseIntPipe) id: number) {
    return this.fees.getPayment(id);
  }

  @Get('adjustments/:id')
  @RequireAnyPermission(...READ)
  adjustment(@Param('id', ParseIntPipe) id: number) {
    return this.fees.getAdjustment(id);
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.fees.get(id);
  }

  @Post('payments')
  @RequireAnyPermission('finance.fees.pay', 'finance.bank.record')
  pay(@CurrentUser() actor: AuthUser, @Body() dto: PayFeeDto) {
    return this.fees.pay(actor, dto);
  }

  @Patch('payments/:id')
  @RequireAnyPermission(...PAY_FEES)
  updatePayment(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeePaymentDto,
  ) {
    return this.fees.updatePayment(actor, id, dto);
  }

  /** CEO: change a fee by an amount, with its reason. */
  @Post('adjustments')
  @RequirePermissions('finance.fees.adjust')
  adjust(@CurrentUser() actor: AuthUser, @Body() dto: AdjustFeeDto) {
    return this.fees.adjust(actor, dto);
  }
}

@Controller('finance/ledgers')
export class LedgersController {
  constructor(private readonly ledgers: HolderLedgerService) {}

  @Get()
  @RequirePermissions('finance.ledgers.view')
  holders() {
    return this.ledgers.holders();
  }

  /** A clearer's own statement, from their own account. */
  @Get('me')
  @RequirePermissions('finance.ledger.own')
  mine(@CurrentUser() actor: AuthUser) {
    if (actor.accountType !== 'CLEARER' || !actor.clearerId) {
      throw new ForbiddenException('كشف الحساب ده للمستخلص بس');
    }
    return this.ledgers.clearer(actor.clearerId);
  }

  @Get('clearers/:id')
  @RequirePermissions('finance.ledgers.view')
  clearer(@Param('id', ParseIntPipe) id: number) {
    return this.ledgers.clearer(id);
  }

  @Get('agents/:id')
  @RequirePermissions('finance.ledgers.view')
  agent(@Param('id', ParseIntPipe) id: number) {
    return this.ledgers.agent(id);
  }

  @Get('way-out')
  @RequirePermissions('finance.ledgers.view')
  wayOut() {
    return this.ledgers.wayOut();
  }
}

@Controller('finance/beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiaries: BeneficiariesService) {}

  @Get()
  @RequireAnyPermission(...READ)
  list(@Query() q: BeneficiariesQueryDto) {
    return this.beneficiaries.list(q);
  }

  @Post()
  @RequireAnyPermission('finance.custody.manage', 'finance.bank.record')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBeneficiaryDto) {
    return this.beneficiaries.create(actor, dto);
  }

  @Patch(':id')
  @RequireAnyPermission('finance.custody.manage', 'finance.bank.record')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBeneficiaryDto,
  ) {
    return this.beneficiaries.update(actor, id, dto);
  }
}
