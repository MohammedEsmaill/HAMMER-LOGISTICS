import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AssetsService } from './assets.service';
import {
  AssetsQueryDto,
  DisposeAssetDto,
  ExistingAssetDto,
  PurchaseAssetDto,
  UpdateAssetDto,
  UpdateAssetTxDto,
} from './dto/asset.dto';

/** Who sees the register: those who keep it, those who buy and sell, the books. */
const READ = ['assets.manage', 'assets.transact', 'finance.gl.view'] as const;
/** An asset transaction is a financial document: its approvers read it too. */
const TX_READ = [...READ, 'finance.review', 'finance.manager_approve', 'finance.approve'] as const;

@Controller('finance/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequireAnyPermission(...READ)
  list(@Query() q: AssetsQueryDto) {
    return this.assets.list(q);
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.assets.get(id);
  }

  /** A device the company had before the system (no money). */
  @Post('existing')
  @RequirePermissions('assets.manage')
  registerExisting(@CurrentUser() actor: AuthUser, @Body() dto: ExistingAssetDto) {
    return this.assets.registerExisting(actor, dto);
  }

  @Post('purchase')
  @RequirePermissions('assets.transact')
  purchase(@CurrentUser() actor: AuthUser, @Body() dto: PurchaseAssetDto) {
    return this.assets.purchase(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('assets.manage')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssetDto) {
    return this.assets.update(actor, id, dto);
  }

  @Post(':id/dispose')
  @RequirePermissions('assets.transact')
  dispose(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DisposeAssetDto) {
    return this.assets.dispose(actor, id, dto);
  }
}

@Controller('finance/asset-transactions')
export class AssetTransactionsController {
  constructor(private readonly assets: AssetsService) {}

  @Get(':id')
  @RequireAnyPermission(...TX_READ)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.assets.getTx(id);
  }

  @Patch(':id')
  @RequireAnyPermission('assets.transact', 'finance.approved.edit')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssetTxDto) {
    return this.assets.updateTx(actor, id, dto);
  }
}
