import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JournalQueryDto } from './dto/journal.dto';
import { JournalService } from './journal.service';
import { REPORT_KINDS, ReportKind, ReportsService } from './reports.service';

/** The journal is read here; operations are recorded on their own endpoints. */
@Controller('finance/journal')
export class JournalController {
  constructor(
    private readonly journal: JournalService,
    private readonly reports: ReportsService,
  ) {}

  @Get()
  @RequirePermissions('finance.journal.view')
  list(@CurrentUser() actor: AuthUser, @Query() query: JournalQueryDto) {
    return this.journal.list(actor, query);
  }

  @Get('authors')
  @RequirePermissions('finance.journal.view')
  authors(@CurrentUser() actor: AuthUser) {
    return this.journal.authors(actor);
  }

  /** A report for a period: summary, then detail. kind: journal, accounts, expenses. */
  @Get('reports/:kind')
  @RequirePermissions('finance.journal.view')
  report(
    @CurrentUser() actor: AuthUser,
    @Param('kind') kind: string,
    @Query() query: JournalQueryDto,
  ) {
    if (!REPORT_KINDS.includes(kind as ReportKind)) {
      throw new NotFoundException('التقرير ده مش موجود');
    }
    return this.reports.report(actor, kind as ReportKind, query);
  }
}
