import { Module } from '@nestjs/common';
import { ApprovalService } from './approvals/approval.service';
import { ApprovalsController } from './approvals/approvals.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { ClearerFeesService } from './clearer-fees.service';
import {
  BeneficiariesController,
  ClearerFeesController,
  CustodiesController,
  LedgersController,
} from './custodies.controller';
import { CustodiesService } from './custodies.service';
import { ExpensesController } from './expenses.controller';
import { HolderLedgerService } from './holder-ledger.service';
import { ExpensesService } from './expenses.service';
import { LedgerService } from './ledger.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { MoneyAccountsController } from './money-accounts.controller';
import { MoneyAccountsService } from './money-accounts.service';
import {
  OtherMovementsController,
  TransfersController,
} from './movements.controller';
import { OtherMovementsService } from './other-movements.service';
import { TransfersService } from './transfers.service';

@Module({
  controllers: [
    MoneyAccountsController,
    TransfersController,
    OtherMovementsController,
    ApprovalsController,
    PayrollController,
    ExpensesController,
    CustodiesController,
    ClearerFeesController,
    LedgersController,
    BeneficiariesController,
  ],
  providers: [
    LedgerService,
    MoneyAccountsService,
    TransfersService,
    OtherMovementsService,
    ApprovalService,
    PayrollService,
    ExpensesService,
    CustodiesService,
    ClearerFeesService,
    HolderLedgerService,
    BeneficiariesService,
  ],
  exports: [LedgerService, ApprovalService, ClearerFeesService],
})
export class FinanceModule {}
