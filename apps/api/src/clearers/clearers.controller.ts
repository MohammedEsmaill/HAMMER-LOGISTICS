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
import { ClearersService } from './clearers.service';
import {
  ClearerPricesDto,
  ClearersQueryDto,
  CreateClearerDto,
  UpdateClearerDto,
} from './dto/clearer.dto';

@Controller('clearers')
export class ClearersController {
  constructor(private readonly clearers: ClearersService) {}

  @Get('options')
  @RequireAnyPermission(
    'clearers.manage',
    'users.manage',
    'shipments.create',
    'shipments.basic.update',
  )
  options() {
    return this.clearers.options();
  }

  @Get()
  @RequirePermissions('clearers.manage')
  list(@Query() query: ClearersQueryDto) {
    return this.clearers.list(query);
  }

  @Get(':id')
  @RequirePermissions('clearers.manage')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.clearers.get(id);
  }

  @Post()
  @RequirePermissions('clearers.manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateClearerDto) {
    return this.clearers.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('clearers.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClearerDto,
  ) {
    return this.clearers.update(actor, id, dto);
  }

  @Patch(':id/prices')
  @RequirePermissions('clearers.prices.manage')
  updatePrices(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClearerPricesDto,
  ) {
    return this.clearers.updatePrices(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('clearers.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clearers.remove(actor, id);
  }
}
