import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  DayParam,
  JournalDaysQueryDto,
  JournalQueryDto,
} from './dto/journal.dto';
import { JournalDaysService } from './journal-days.service';
import { JournalService } from './journal.service';
import { REPORT_KINDS, ReportKind, ReportsService } from './reports.service';

/** The journal is read here; operations are recorded on their own endpoints. */
@Controller('finance/journal')
export class JournalController {
  constructor(
    private readonly journal: JournalService,
    private readonly reports: ReportsService,
    private readonly journalDays: JournalDaysService,
  ) {}

  @Get()
  @RequirePermissions('finance.journal.view')
  list(@CurrentUser() actor: AuthUser, @Query() query: JournalQueryDto) {
    return this.journal.list(actor, query);
  }

  /** The days, newest first; a file number or party narrows them. */
  @Get('days')
  @RequirePermissions('finance.journal.view')
  days(@CurrentUser() actor: AuthUser, @Query() query: JournalDaysQueryDto) {
    return this.journalDays.list(actor, query);
  }

  @Get('days/:date')
  @RequirePermissions('finance.journal.view')
  day(@Param() p: DayParam) {
    return this.journalDays.get(p.date);
  }

  /** The CEO reopens a closed day until the end of today. */
  @Post('days/:date/reopen')
  @RequirePermissions('finance.approved.edit')
  reopen(@CurrentUser() actor: AuthUser, @Param() p: DayParam) {
    return this.journalDays.reopen(actor, p.date);
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
