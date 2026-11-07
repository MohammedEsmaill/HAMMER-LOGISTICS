import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseEnumPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequireAnyPermission } from '../../auth/decorators/permissions.decorator';
import { ApprovalActionDto, ApprovalQueryDto } from './approval.dto';
import { APPROVABLE_TYPES, ApprovalService } from './approval.service';
import type { ApprovableType, ApprovalAction } from './approval.service';

const typePipe = new ParseEnumPipe(
  Object.fromEntries(APPROVABLE_TYPES.map((t) => [t, t])),
);
const actionPipe = new ParseEnumPipe({
  review: 'review',
  'manager-approve': 'manager-approve',
  approve: 'approve',
  reject: 'reject',
});

@Controller('finance/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalService) {}

  /** Approvers see every document; whoever records documents sees their own. */
  @Get()
  @RequireAnyPermission(
    'finance.review',
    'finance.manager_approve',
    'finance.approve',
    'finance.approved.edit',
    'finance.movements.create',
  )
  list(@CurrentUser() actor: AuthUser, @Query() query: ApprovalQueryDto) {
    return this.approvals.list(actor, query);
  }

  /** The service checks the step's own permission and whose turn it is. */
  @Post(':type/:id/:action')
  @RequireAnyPermission(
    'finance.review',
    'finance.manager_approve',
    'finance.approve',
  )
  act(
    @CurrentUser() actor: AuthUser,
    @Param('type', typePipe) type: ApprovableType,
    @Param('id', ParseIntPipe) id: number,
    @Param('action', actionPipe) action: ApprovalAction,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvals.act(actor, type, id, action, dto.version, dto.reason);
  }
}
