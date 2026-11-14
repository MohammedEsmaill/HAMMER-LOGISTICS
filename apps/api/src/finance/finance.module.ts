import { Module } from '@nestjs/common';
import { ApprovalService } from './approvals/approval.service';
import { ApprovalsController } from './approvals/approvals.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { ClearerFeesService } from './clearer-fees.service';
import { ClientLedgerService } from './client-ledger.service';
import { CollectionsService } from './collections.service';
import {
  ClientLedgerController,
  CollectionsController,
  InvoicesController,
  ShipmentAccountsController,
} from './shipment-account.controller';
import { ShipmentAccountService } from './shipment-account.service';
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
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { ReportsService } from './reports.service';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { JournalDaysService } from './journal-days.service';

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
    ShipmentAccountsController,
    InvoicesController,
    CollectionsController,
    ClientLedgerController,
    JournalController,
    PricesController,
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
    ShipmentAccountService,
    CollectionsService,
    ClientLedgerService,
    JournalService,
    ReportsService,
    PricesService,
    JournalDaysService,
  ],
  exports: [
    LedgerService,
    ApprovalService,
    ClearerFeesService,
    JournalService,
    JournalDaysService,
  ],
})
export class FinanceModule {}
