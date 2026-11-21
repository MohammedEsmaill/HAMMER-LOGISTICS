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
  CreatePartyDto,
  CreatePartyMovementDto,
  PartyStatementQueryDto,
  UpdatePartyDto,
  UpdatePartyMovementDto,
} from './dto/party.dto';
import { PartiesService } from './parties.service';

/** Reading: who sees the internal accounts, records on them or approves them. */
const READ = [
  'finance.parties.view',
  'finance.parties.record',
  'finance.review',
  'finance.approve',
] as const;

/** Editing a movement: the service lets the author edit until approval, then only the CEO. */
const EDIT = ['finance.parties.record', 'finance.approved.edit'] as const;

/** The internal accounts: sister companies and owners, and their movements. */
@Controller('finance/parties')
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}

  /** Who only sets the parties up (the moderator) sees them without their balances. */
  @Get()
  @RequireAnyPermission(...READ, 'finance.parties.manage')
  list(@CurrentUser() actor: AuthUser) {
    return this.parties.list(actor);
  }

  @Get('options')
  @RequireAnyPermission(...READ, 'finance.accounts.manage')
  options() {
    return this.parties.options();
  }

  @Post()
  @RequirePermissions('finance.parties.manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreatePartyDto) {
    return this.parties.createParty(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('finance.parties.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartyDto,
  ) {
    return this.parties.updateParty(actor, id, dto);
  }

  @Get(':id/statement')
  @RequireAnyPermission(...READ)
  statement(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: PartyStatementQueryDto,
  ) {
    return this.parties.statement(id, q);
  }
}

@Controller('finance/party-movements')
export class PartyMovementsController {
  constructor(private readonly parties: PartiesService) {}

  @Get(':id')
  @RequireAnyPermission(...READ)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.parties.get(id);
  }

  @Post()
  @RequirePermissions('finance.parties.record')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreatePartyMovementDto) {
    return this.parties.create(actor, dto);
  }

  @Patch(':id')
  @RequireAnyPermission(...EDIT)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartyMovementDto,
  ) {
    return this.parties.update(actor, id, dto);
  }
}
