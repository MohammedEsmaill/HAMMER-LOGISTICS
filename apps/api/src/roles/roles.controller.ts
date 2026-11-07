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
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Names only, for the user form: HR assigns roles without managing them. */
  @Get('options')
  @RequireAnyPermission('roles.manage', 'users.manage')
  options() {
    return this.roles.options();
  }

  @Get('permissions')
  @RequirePermissions('roles.manage')
  catalog() {
    return this.roles.catalog();
  }

  @Get()
  @RequirePermissions('roles.manage')
  list() {
    return this.roles.list();
  }

  @Post()
  @RequirePermissions('roles.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.roles.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('roles.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('roles.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.roles.remove(user, id);
  }
}
