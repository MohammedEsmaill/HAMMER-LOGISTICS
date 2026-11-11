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

/**
 * Who works on shipments or their accounts picks clients from short lists (id and
 * name), without seeing the clients screen, which is clients.view.
 */
const CLIENT_PICKERS = [
  'clients.view',
  'shipments.view.all',
  'shipments.view.own',
  'finance.shipment-account.view',
  'finance.client-ledger.view',
] as const;
import { ClientsService } from './clients.service';
import {
  ClientsQueryDto,
  CreateClientDto,
  CreateFactoryDto,
  UpdateClientDto,
  UpdateFactoryDto,
} from './dto/client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  /** Live clients for pickers (shipment registration), name order. */
  @Get('options')
  @RequireAnyPermission(...CLIENT_PICKERS)
  options() {
    return this.clients.options();
  }

  @Get()
  @RequirePermissions('clients.view')
  list(@CurrentUser() actor: AuthUser, @Query() query: ClientsQueryDto) {
    return this.clients.list(actor, query);
  }

  @Get(':id')
  @RequirePermissions('clients.view')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.clients.get(actor, id);
  }

  /** A client's live factories for the shipment form: id, name and tax number only. */
  @Get(':id/factories/options')
  @RequireAnyPermission(...CLIENT_PICKERS)
  factoryOptions(@Param('id', ParseIntPipe) id: number) {
    return this.clients.factoryOptions(id);
  }

  @Get(':id/factories')
  @RequirePermissions('clients.view')
  factories(@Param('id', ParseIntPipe) id: number) {
    return this.clients.factories(id);
  }

  @Post()
  @RequirePermissions('clients.manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateClientDto) {
    return this.clients.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('clients.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('clients.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clients.remove(actor, id);
  }

  @Post(':id/factories')
  @RequirePermissions('clients.manage')
  addFactory(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFactoryDto,
  ) {
    return this.clients.addFactory(actor, id, dto);
  }
}

@Controller('factories')
@RequirePermissions('clients.manage')
export class FactoriesController {
  constructor(private readonly clients: ClientsService) {}

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFactoryDto,
  ) {
    return this.clients.updateFactory(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clients.removeFactory(actor, id);
  }
}
