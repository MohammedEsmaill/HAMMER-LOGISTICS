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
  'finance.ledgers.view',
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
] as const;
const EDIT = ['finance.custody.manage', 'finance.approved.edit'] as const;

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
  @RequirePermissions('finance.custody.manage')
  issue(@CurrentUser() actor: AuthUser, @Body() dto: IssueCustodyDto) {
    return this.custodies.issue(actor, dto);
  }

  @Patch(':id')
  @RequireAnyPermission(...EDIT)
  updateIssue(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.custodies.updateIssue(actor, id, dto);
  }

  /** Settles an open custody, or replaces the items of a settled one. */
  @Post(':id/settlement')
  @RequireAnyPermission(...EDIT)
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
  @RequirePermissions('finance.custody.manage')
  pay(@CurrentUser() actor: AuthUser, @Body() dto: PayFeeDto) {
    return this.fees.pay(actor, dto);
  }

  @Patch('payments/:id')
  @RequireAnyPermission(...EDIT)
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
  @RequirePermissions('finance.custody.manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBeneficiaryDto) {
    return this.beneficiaries.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('finance.custody.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBeneficiaryDto,
  ) {
    return this.beneficiaries.update(actor, id, dto);
  }
}
