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
  AdvancesQueryDto,
  CreateAdvanceDto,
  CreateSalaryDto,
  SalariesQueryDto,
  SalaryPreviewQueryDto,
  UpdateAdvanceDto,
  UpdateSalaryDto,
} from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

/**
 * Salaries are seen by who pays them, who may see salaries (HR, CEO) and the
 * approvers who review them.
 */
const READ = [
  'finance.payroll.manage',
  'employees.salary.view',
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
] as const;
const EDIT = ['finance.payroll.manage', 'finance.approved.edit'] as const;

@Controller('finance')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('salaries/preview')
  @RequirePermissions('finance.payroll.manage')
  preview(@Query() q: SalaryPreviewQueryDto) {
    return this.payroll.preview(q.employeeId, q.month);
  }

  @Get('salaries')
  @RequireAnyPermission(...READ)
  salaries(@Query() q: SalariesQueryDto) {
    return this.payroll.listSalaries(q);
  }

  @Get('salaries/:id')
  @RequireAnyPermission(...READ)
  salary(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.getSalary(id);
  }

  @Post('salaries')
  @RequirePermissions('finance.payroll.manage')
  createSalary(@CurrentUser() actor: AuthUser, @Body() dto: CreateSalaryDto) {
    return this.payroll.createSalary(actor, dto);
  }

  @Patch('salaries/:id')
  @RequireAnyPermission(...EDIT)
  updateSalary(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalaryDto,
  ) {
    return this.payroll.updateSalary(actor, id, dto);
  }

  @Get('advances/balances')
  @RequireAnyPermission(...READ)
  balances() {
    return this.payroll.balances();
  }

  @Get('advances')
  @RequireAnyPermission(...READ)
  advances(@Query() q: AdvancesQueryDto) {
    return this.payroll.listAdvances(q);
  }

  @Get('advances/:id')
  @RequireAnyPermission(...READ)
  advance(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.getAdvance(id);
  }

  @Post('advances')
  @RequirePermissions('finance.payroll.manage')
  createAdvance(@CurrentUser() actor: AuthUser, @Body() dto: CreateAdvanceDto) {
    return this.payroll.createAdvance(actor, dto);
  }

  @Patch('advances/:id')
  @RequireAnyPermission(...EDIT)
  updateAdvance(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdvanceDto,
  ) {
    return this.payroll.updateAdvance(actor, id, dto);
  }

  /** كشف سلف الموظف */
  @Get('employees/:id/advances')
  @RequireAnyPermission(...READ)
  statement(@Param('id', ParseIntPipe) id: number) {
    return this.payroll.advanceStatement(id);
  }
}
