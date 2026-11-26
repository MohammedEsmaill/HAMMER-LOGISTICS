import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { IntegrityController } from './integrity.controller';
import { IntegrityService } from './integrity.service';

@Module({
  imports: [FinanceModule],
  controllers: [IntegrityController],
  providers: [IntegrityService],
  exports: [IntegrityService],
})
export class IntegrityModule {}
