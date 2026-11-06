import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { FileNumberService } from './file-number.service';
import { ShipmentValidator, billNumbers } from './shipment-validator.service';
import { ShipmentsService } from './shipments.service';
import { StageHistoryEntry } from './stage-history';
import { STAGE_FLOWS } from './stages';

@Injectable()
export class ShipmentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: ShipmentValidator,
    private readonly fileNumbers: FileNumberService,
    private readonly shipments: ShipmentsService,
    private readonly audit: AuditService,
  ) {}

  async register(actor: AuthUser, dto: CreateShipmentDto) {
    const rules = this.validator.rulesFor(dto.direction, dto.mode);
    this.validator.assertFields(rules, dto);

    const id = await this.prisma.$transaction(async (tx) => {
      await this.validator.assertReferences(tx, rules, dto);
      const operationEmployeeId = await this.validator.operationEmployeeFor(
        tx,
        rules,
        dto.clientId,
      );
      await this.validator.assertNoDuplicates(tx, dto);

      const fileNo = await this.fileNumbers.next(tx);
      const containers = rules.containers ? (dto.containers ?? []) : [];
      const firstStage = STAGE_FLOWS[rules.kind][0].stage;
      const history: StageHistoryEntry[] = [
        {
          from: null,
          to: firstStage,
          movement: 'FORWARD',
          at: new Date().toISOString(),
          by: actor.id,
        },
      ];

      const shipment = await tx.shipment.create({
        data: {
          ...this.validator.basicData(rules, dto),
          fileNo,
          direction: rules.direction,
          mode: rules.mode,
          operationEmployeeId,
          vesselName: dto.vesselName,
          eta: dto.eta,
          currentStage: firstStage,
          stageHistory: history as unknown as Prisma.InputJsonArray,
          createdById: actor.id,
          containers: {
            create: containers.map((c, i) => ({
              seq: i + 1,
              containerNo: c.containerNo,
              type: c.type,
              weight: new Prisma.Decimal(c.weight.toFixed(3)),
            })),
          },
          billNumbers: {
            create: billNumbers(dto).map((number) => ({ number })),
          },
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'shipment',
          entityId: shipment.id,
          after: { ...shipment, containers },
        },
        tx,
      );
      return shipment.id;
    });
    return this.shipments.get(actor, id);
  }
}
