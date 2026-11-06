import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, can } from '../auth/auth-user';
import { Permission } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { shipmentScope } from './access-scope';
import { MoveStageDto } from './dto/customs.dto';
import { StageHistoryEntry } from './stage-history';
import { claimVersion } from './shipment-version';
import { ShipmentsService } from './shipments.service';
import { STAGE_FLOWS, StageGroup, shipmentKind, stageLabel } from './stages';

/** The permission that moves a shipment into a stage of each group. */
const GROUP_PERMISSION: Record<StageGroup, Permission> = {
  // back to "registered": an operations correction
  AUTO: 'shipments.stage.operation',
  OPERATION: 'shipments.stage.operation',
  CUSTOMS: 'shipments.stage.customs',
};

/**
 * Stage moves (spec section 6): forward one stage at a time, back to any earlier
 * stage, reason optional. The stage and its history entry are written together.
 */
@Injectable()
export class ShipmentStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipments: ShipmentsService,
    private readonly audit: AuditService,
  ) {}

  async move(actor: AuthUser, id: number, dto: MoveStageDto) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { AND: [{ id }, shipmentScope(actor)] },
    });
    if (!shipment) throw new NotFoundException('الشحنة غير موجودة');

    const kind = shipmentKind(shipment.direction, shipment.mode);
    const flow = STAGE_FLOWS[kind];
    const current = flow.findIndex((s) => s.stage === shipment.currentStage);
    const target = flow.findIndex((s) => s.stage === dto.to);

    if (target === -1) {
      throw new BadRequestException('المرحلة دي مش من مراحل نوع الشحنة ده');
    }
    if (target === current) {
      throw new BadRequestException('الشحنة في المرحلة دي بالفعل');
    }
    if (target > current + 1) {
      throw new BadRequestException(
        `مينفعش تتخطى مراحل: المرحلة الجاية هي "${stageLabel(kind, flow[current + 1].stage)}"`,
      );
    }
    if (!can(actor, GROUP_PERMISSION[flow[target].group])) {
      throw new ForbiddenException(
        `ليس لديك صلاحية تحريك الشحنة لمرحلة "${stageLabel(kind, dto.to)}"`,
      );
    }
    const now = new Date();
    if (dto.occurredAt && dto.occurredAt > now) {
      throw new BadRequestException('تاريخ المرحلة مينفعش يبقى في المستقبل');
    }

    const entry: StageHistoryEntry = {
      from: shipment.currentStage,
      to: dto.to,
      movement: target > current ? 'FORWARD' : 'BACKWARD',
      at: (dto.occurredAt ?? now).toISOString(),
      recordedAt: now.toISOString(),
      by: actor.id,
      ...(dto.reason ? { reason: dto.reason } : {}),
    };
    const history = [
      ...(shipment.stageHistory as unknown as StageHistoryEntry[]),
      entry,
    ];

    await this.prisma.$transaction(async (tx) => {
      await claimVersion(tx, id, dto.version);
      await tx.shipment.update({
        where: { id },
        data: {
          currentStage: dto.to,
          stageHistory: history as unknown as Prisma.InputJsonArray,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'STAGE_MOVE',
          entity: 'shipment',
          entityId: id,
          before: { currentStage: shipment.currentStage },
          after: entry,
        },
        tx,
      );
    });
    return this.shipments.get(actor, id);
  }
}
