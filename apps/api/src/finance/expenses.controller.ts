import {
  Body,
  Controller,
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
import {
  CreateExpenseDto,
  ExpensesQueryDto,
  UpdateExpenseDto,
  CreateExpenseTypeDto,
  UpdateExpenseTypeDto,
} from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

const READ = [
  'finance.expenses.manage',
  'finance.expenses.report',
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
  'finance.journal.view',
  'finance.bank.record',
] as const;

@Controller('finance/expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get('types')
  @RequireAnyPermission(...READ)
  types() {
    return this.expenses.types();
  }

  /** A new item on the fixed list (the CEO and the moderator, from the fixed lists). */
  @Post('types')
  @RequirePermissions('lookups.manage')
  createType(@CurrentUser() actor: AuthUser, @Body() dto: CreateExpenseTypeDto) {
    return this.expenses.createType(actor, dto.name, dto.category);
  }

  /** Moves a type under another main item, or renames it (the fixed lists). */
  @Patch('types/:id')
  @RequireAnyPermission('finance.expenses.manage', 'finance.approved.edit', 'lookups.manage')
  setCategory(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseTypeDto,
  ) {
    return this.expenses.setCategory(actor, id, dto.category, dto.name);
  }

  @Get('report')
  @RequirePermissions('finance.expenses.report')
  report(@Query() q: ExpensesQueryDto) {
    return this.expenses.report(q);
  }

  @Get()
  @RequireAnyPermission(...READ)
  list(@Query() q: ExpensesQueryDto) {
    return this.expenses.list(q);
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.expenses.get(id);
  }

  /** Cash: the treasury manager. From a bank: the accountant too (the service checks). */
  @Post()
  @RequireAnyPermission('finance.expenses.manage', 'finance.bank.record')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(actor, dto);
  }

  @Patch(':id')
  @RequireAnyPermission(
    'finance.expenses.manage',
    'finance.bank.record',
    'finance.approved.edit',
  )
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(actor, id, dto);
  }
}
