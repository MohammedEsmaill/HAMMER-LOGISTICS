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
  CreateOtherMovementDto,
  CreateTransferDto,
  MovementsQueryDto,
  UpdateOtherMovementDto,
  UpdateTransferDto,
} from './dto/movement.dto';
import { OtherMovementsService } from './other-movements.service';
import { TransfersService } from './transfers.service';

/** Reading: whoever sees balances, records movements or approves them. */
const READ = [
  'finance.balances.view',
  'finance.movements.create',
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
] as const;

/** Editing: the service lets the author edit until approval, then only the CEO. */
const EDIT = ['finance.movements.create', 'finance.approved.edit'] as const;

@Controller('finance/transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequireAnyPermission(...READ)
  list(@Query() query: MovementsQueryDto) {
    return this.transfers.list(query);
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.transfers.get(id);
  }

  @Post()
  @RequirePermissions('finance.movements.create')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateTransferDto) {
    return this.transfers.create(actor, dto);
  }

  @Patch(':id')
  @RequireAnyPermission(...EDIT)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransferDto,
  ) {
    return this.transfers.update(actor, id, dto);
  }
}

@Controller('finance/other-movements')
export class OtherMovementsController {
  constructor(private readonly movements: OtherMovementsService) {}

  @Get()
  @RequireAnyPermission(...READ)
  list(@Query() query: MovementsQueryDto) {
    return this.movements.list(query);
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.movements.get(id);
  }

  @Post()
  @RequirePermissions('finance.movements.create')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateOtherMovementDto) {
    return this.movements.create(actor, dto);
  }

  @Patch(':id')
  @RequireAnyPermission(...EDIT)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOtherMovementDto,
  ) {
    return this.movements.update(actor, id, dto);
  }
}
