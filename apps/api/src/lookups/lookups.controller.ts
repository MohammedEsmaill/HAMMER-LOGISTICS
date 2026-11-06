import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseEnumPipe,
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
  CreatePortDto,
  CreateLookupDto,
  KindQueryDto,
  PortsQueryDto,
  SearchQueryDto,
  UpdateLookupDto,
  UpdatePortDto,
} from './dto/lookup.dto';
import { LookupsService, SIMPLE_LOOKUPS } from './lookups.service';
import type { SimpleLookup } from './lookups.service';

const lookupPipe = new ParseEnumPipe(
  Object.fromEntries(SIMPLE_LOOKUPS.map((l) => [l, l])),
);

/**
 * Reading the lists needs only a login (every form uses them). Adding needs lookups.add
 * (NAFEZA) or lookups.manage; editing and deleting need lookups.manage (CEO).
 */
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get('countries')
  countries(@Query() query: SearchQueryDto) {
    return this.lookups.countries(query.search);
  }

  @Get('ports')
  ports(@Query() query: PortsQueryDto) {
    return this.lookups.ports(query);
  }

  @Post('ports')
  @RequireAnyPermission('lookups.add', 'lookups.manage')
  createPort(@CurrentUser() actor: AuthUser, @Body() dto: CreatePortDto) {
    return this.lookups.createPort(actor, dto);
  }

  @Patch('ports/:id')
  @RequirePermissions('lookups.manage')
  updatePort(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePortDto,
  ) {
    return this.lookups.updatePort(actor, id, dto);
  }

  @Delete('ports/:id')
  @RequirePermissions('lookups.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePort(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lookups.remove(actor, 'ports', id);
  }

  @Get(':lookup')
  list(
    @Param('lookup', lookupPipe) lookup: SimpleLookup,
    @Query() query: KindQueryDto,
  ) {
    return this.lookups.list(lookup, query);
  }

  @Post(':lookup')
  @RequireAnyPermission('lookups.add', 'lookups.manage')
  create(
    @CurrentUser() actor: AuthUser,
    @Param('lookup', lookupPipe) lookup: SimpleLookup,
    @Body() dto: CreateLookupDto,
  ) {
    return this.lookups.create(actor, lookup, dto);
  }

  @Patch(':lookup/:id')
  @RequirePermissions('lookups.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('lookup', lookupPipe) lookup: SimpleLookup,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLookupDto,
  ) {
    return this.lookups.update(actor, lookup, id, dto);
  }

  @Delete(':lookup/:id')
  @RequirePermissions('lookups.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('lookup', lookupPipe) lookup: SimpleLookup,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lookups.remove(actor, lookup, id);
  }
}
