import {
  Body,
  Controller,
  Get,
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
import {
  CreateSettlementItemDto,
  RegimeParam,
  UpdateFeeRateDto,
  UpdateSettlementItemDto,
} from './dto/prices.dto';
import { PricesService } from './prices.service';

/** The price lists: read by who settles or reviews custodies and the lookups screen, set by the CEO. */
@Controller('finance/prices')
export class PricesController {
  constructor(private readonly prices: PricesService) {}

  @Get()
  @RequireAnyPermission(
    'lookups.add',
    'lookups.manage',
    'finance.custody.manage',
    'finance.ledgers.view',
    'finance.review',
    'finance.manager_approve',
    'finance.approve',
    'finance.prices.manage',
  )
  list() {
    return this.prices.list();
  }

  @Patch('fee-rates/:regime')
  @RequirePermissions('finance.prices.manage')
  updateFeeRate(
    @CurrentUser() actor: AuthUser,
    @Param() p: RegimeParam,
    @Body() dto: UpdateFeeRateDto,
  ) {
    return this.prices.updateFeeRate(actor, p.regime, dto);
  }

  @Post('items')
  @RequirePermissions('finance.prices.manage')
  createItem(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateSettlementItemDto,
  ) {
    return this.prices.createItem(actor, dto);
  }

  @Patch('items/:id')
  @RequirePermissions('finance.prices.manage')
  updateItem(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSettlementItemDto,
  ) {
    return this.prices.updateItem(actor, id, dto);
  }
}
