import {
  Body,
  Controller,
  Delete,
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
import { ClientLedgerService } from './client-ledger.service';
import { CollectionsService } from './collections.service';
import {
  AccountsQueryDto,
  CreateCollectionDto,
  ExtraLineDto,
  FinishDto,
  ReopenDto,
  StatementOverrideDto,
  UpdateCollectionDto,
} from './dto/shipment-account.dto';
import { ShipmentAccountService } from './shipment-account.service';

const READ = [
  'finance.shipment-account.view',
  'finance.statement.manage',
  'finance.collections.manage',
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
] as const;

@Controller('finance/shipment-accounts')
export class ShipmentAccountsController {
  constructor(private readonly accounts: ShipmentAccountService) {}

  @Get()
  @RequireAnyPermission(...READ)
  list(@Query() q: AccountsQueryDto) {
    return this.accounts.list(q);
  }

  @Get(':shipmentId')
  @RequireAnyPermission(...READ)
  get(@Param('shipmentId', ParseIntPipe) shipmentId: number) {
    return this.accounts.get(shipmentId);
  }

  /** Drop a settlement item from the client statement, or change its amount / line. */
  @Patch('items/:itemId')
  @RequirePermissions('finance.statement.manage')
  override(
    @CurrentUser() actor: AuthUser,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: StatementOverrideDto,
  ) {
    return this.accounts.setOverride(actor, itemId, dto);
  }

  @Post(':shipmentId/extra-lines')
  @RequirePermissions('finance.statement.manage')
  addExtra(
    @CurrentUser() actor: AuthUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: ExtraLineDto,
  ) {
    return this.accounts.addExtra(actor, shipmentId, dto);
  }

  @Delete('extra-lines/:id')
  @RequirePermissions('finance.statement.manage')
  removeExtra(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accounts.removeExtra(actor, id);
  }

  @Post(':shipmentId/finish')
  @RequirePermissions('finance.statement.manage')
  finish(
    @CurrentUser() actor: AuthUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: FinishDto,
  ) {
    return this.accounts.finish(actor, shipmentId, dto);
  }

  /** The service decides who: the accountant while unpaid, financial relations after. */
  @Post(':shipmentId/reopen')
  @RequireAnyPermission(
    'finance.statement.manage',
    'finance.collections.manage',
  )
  reopen(
    @CurrentUser() actor: AuthUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: ReopenDto,
  ) {
    return this.accounts.reopen(actor, shipmentId, dto);
  }
}

@Controller('finance/invoices')
export class InvoicesController {
  constructor(private readonly accounts: ShipmentAccountService) {}

  /** One invoice with the shipment header it prints with. */
  @Get(':id')
  @RequireAnyPermission(...READ, 'finance.client-ledger.view')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.accounts.invoice(id);
  }
}

@Controller('finance/collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get(':id')
  @RequireAnyPermission(...READ, 'finance.client-ledger.view')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.collections.get(id);
  }

  @Post()
  @RequirePermissions('finance.collections.manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateCollectionDto) {
    return this.collections.create(actor, dto);
  }

  @Patch(':id')
  @RequireAnyPermission('finance.collections.manage', 'finance.approved.edit')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collections.update(actor, id, dto);
  }
}

@Controller('finance/clients')
export class ClientLedgerController {
  constructor(private readonly ledger: ClientLedgerService) {}

  @Get('balances')
  @RequirePermissions('finance.client-ledger.view')
  balances() {
    return this.ledger.balances();
  }

  @Get(':id/ledger')
  @RequirePermissions('finance.client-ledger.view')
  ledgerOf(@Param('id', ParseIntPipe) id: number) {
    return this.ledger.ledger(id);
  }
}
