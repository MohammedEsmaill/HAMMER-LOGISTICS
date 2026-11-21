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

  /** Moves a type under another main item. */
  @Patch('types/:id')
  @RequireAnyPermission('finance.expenses.manage', 'finance.approved.edit')
  setCategory(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseTypeDto,
  ) {
    return this.expenses.setCategory(actor, id, dto.category);
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
