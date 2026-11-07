import { Module } from '@nestjs/common';
import { ApprovalService } from './approvals/approval.service';
import { ApprovalsController } from './approvals/approvals.controller';
import { LedgerService } from './ledger.service';
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
  ],
  providers: [
    LedgerService,
    MoneyAccountsService,
    TransfersService,
    OtherMovementsService,
    ApprovalService,
  ],
  exports: [LedgerService, ApprovalService],
})
export class FinanceModule {}
