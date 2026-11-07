import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  CreateEmployeeDto,
  EmployeeOptionsQueryDto,
  EmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('options')
  @RequireAnyPermission(
    'employees.manage',
    'users.manage',
    'clients.manage',
    'shipments.reassign',
    'finance.payroll.manage',
    'finance.custody.manage',
  )
  options(@Query() query: EmployeeOptionsQueryDto) {
    return this.employees.options(query.department);
  }

  @Get()
  @RequirePermissions('employees.manage')
  list(@CurrentUser() actor: AuthUser, @Query() query: EmployeesQueryDto) {
    return this.employees.list(actor, query);
  }

  @Get(':id')
  @RequirePermissions('employees.manage')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.employees.get(actor, id);
  }

  @Post()
  @RequirePermissions('employees.manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('employees.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('employees.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employees.remove(actor, id);
  }
}
