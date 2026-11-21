import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PartyDocumentsModule } from '../party-documents/party-documents.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [FinanceModule, PartyDocumentsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
