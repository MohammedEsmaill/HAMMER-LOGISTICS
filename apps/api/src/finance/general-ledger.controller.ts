import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { LedgerQueryDto, TrialBalanceQueryDto } from './dto/general-ledger.dto';
import { GeneralLedgerService } from './general-ledger.service';

/** The general ledger: the chart of accounts, the trial balance and each account's ledger. */
@Controller('finance/gl')
@RequirePermissions('finance.gl.view')
export class GeneralLedgerController {
  constructor(private readonly gl: GeneralLedgerService) {}

  @Get('accounts')
  chart() {
    return this.gl.chart();
  }

  @Get('trial-balance')
  trialBalance(@Query() q: TrialBalanceQueryDto) {
    return this.gl.trialBalance(q.currency, q.from, q.to);
  }

  @Get('ledger')
  ledger(@Query() q: LedgerQueryDto) {
    return this.gl.ledger(q.account, q.currency, q.from, q.to);
  }

  /** What does not hold together in the books; empty when they balance. */
  @Get('check')
  async check() {
    return { problems: await this.gl.check() };
  }
}
