import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Custody, CustodyHolder, CustodyPurpose, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, can } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import { ClearerFeesService } from './clearer-fees.service';
import { nextCustodyNo } from './custody-number';
import { claimDocument } from './document-version';
import {
  CustodiesQueryDto,
  CustodyItemDto,
  IssueCustodyDto,
  SettleCustodyDto,
  UpdateIssueDto,
} from './dto/custody.dto';
import { LedgerService } from './ledger.service';
import { businessDate, decimal, formatAmount } from './money';
import { DOCUMENT_INCLUDE } from './transfers.service';

const ZERO = new Prisma.Decimal(0);

/** What each holder type may be used for, paid from, and whether it may overspend (spec section 11). */
const HOLDERS: Record<
  CustodyHolder,
  { purposes: CustodyPurpose[] | null; overspend: boolean; label: string }
> = {
  AGENT: {
    purposes: ['UNLOADING', 'RELEASE', 'STORAGE'],
    overspend: false,
    label: 'مندوب توكيلات',
  },
  WAY_OUT: {
    purposes: ['UNLOADING', 'RELEASE', 'STORAGE'],
    overspend: false,
    label: 'WAY OUT',
  },
  CLEARER: {
    purposes: ['CLEARANCE', 'RELEASE'],
    overspend: true,
    label: 'مستخلص',
  },
  BANK_TRANSFER: { purposes: null, overspend: false, label: 'تحويل بنكي' },
};

const INCLUDE = {
  shipment: {
    select: {
      id: true,
      fileNo: true,
      clearerId: true,
      client: { select: { id: true, name: true } },
    },
  },
  agent: { select: { id: true, fullName: true, code: true } },
  clearer: { select: { id: true, fullName: true } },
  sourceAccount: {
    select: { id: true, name: true, type: true, currency: true },
  },
  settledBy: { select: { id: true, email: true } },
  computedFee: { select: { id: true, amount: true } },
} as const;

export interface DuplicateReceipt {
  receiptNo: string;
  custodyNo: string;
  fileNo: string;
}

/**
 * Custodies (spec section 11): the only way an expense reaches a shipment. Issued from
 * the cash box (or paid straight from a bank), settled once with its items: the rest
 * comes back, or a clearer's overspend is paid out; the balances move at both times.
 */
@Injectable()
export class CustodiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fees: ClearerFeesService,
    private readonly audit: AuditService,
  ) {}

  list(q: CustodiesQueryDto) {
    const where: Prisma.CustodyWhereInput = {
      shipmentId: q.shipmentId,
      status: q.status,
      holderType: q.holderType,
      clearerId: q.clearerId,
      agentEmployeeId: q.agentEmployeeId,
      approvalStatus: q.approvalStatus,
      ...(q.search
        ? {
            OR: [
              { custodyNo: { contains: q.search.toUpperCase() } },
              { shipment: { fileNo: { contains: q.search.toUpperCase() } } },
            ],
          }
        : {}),
    };
    return this.prisma
      .$transaction([
        this.prisma.custody.findMany({
          where,
          include: {
            ...INCLUDE,
            createdBy: { select: { id: true, email: true } },
          },
          orderBy: { id: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        this.prisma.custody.count({ where }),
      ])
      .then(([items, total]) => ({
        items,
        total,
        page: q.page,
        pageSize: q.pageSize,
      }));
  }

  async get(id: number) {
    const custody = await this.prisma.custody.findUnique({
      where: { id },
      include: {
        ...INCLUDE,
        items: {
          orderBy: { lineNo: 'asc' },
          include: { expenseType: { select: { id: true, name: true } } },
        },
        ...DOCUMENT_INCLUDE,
      },
    });
    if (!custody) throw new NotFoundException('العهدة غير موجودة');
    return {
      ...custody,
      duplicateReceipts: await this.duplicateReceipts(this.prisma, custody.id),
    };
  }

  async issue(actor: AuthUser, dto: IssueCustodyDto) {
    const rule = HOLDERS[dto.holderType];
    const id = await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: dto.shipmentId },
      });
      if (!shipment) throw new NotFoundException('الشحنة غير موجودة');
      if (
        rule.purposes &&
        (!dto.purpose || !rule.purposes.includes(dto.purpose))
      ) {
        throw new BadRequestException(
          `اختار الغرض المناسب لعهدة ${rule.label}`,
        );
      }
      if (!rule.purposes && dto.purpose) {
        throw new BadRequestException('التحويل البنكي مالوش غرض');
      }
      const holder = await this.holderFields(tx, dto, shipment.clearerId);
      const account = await this.sourceAccount(tx, dto);
      const custody = await tx.custody.create({
        data: {
          custodyNo: await nextCustodyNo(tx),
          shipmentId: shipment.id,
          holderType: dto.holderType,
          ...holder,
          purpose: dto.purpose ?? null,
          sourceAccountId: account.id,
          currency: account.currency,
          amount: decimal(dto.amount),
          issueDate: businessDate(dto.issueDate, 'تاريخ الصرف'),
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.ledger.post(tx, {
        accountId: account.id,
        direction: 'OUT',
        amount: custody.amount,
        date: custody.issueDate,
        source: 'CUSTODY',
        documentId: custody.id,
        actorId: actor.id,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'custody',
          entityId: custody.id,
          after: custody,
        },
        tx,
      );
      return custody.id;
    });
    return this.get(id);
  }

  /** While open: amount, purpose, date and notes; the issue line is corrected by a reversal. */
  async updateIssue(actor: AuthUser, id: number, dto: UpdateIssueDto) {
    await this.prisma.$transaction(async (tx) => {
      await claimDocument(tx, 'CUSTODY', id, dto.version);
      const before = await tx.custody.findUniqueOrThrow({ where: { id } });
      if (before.status !== 'OPEN') {
        throw new BadRequestException('العهدة اتصفت، عدّل التصفية بدل الصرف');
      }
      this.assertAuthor(actor, before);
      const rule = HOLDERS[before.holderType];
      if (
        dto.purpose !== undefined &&
        (!rule.purposes || !rule.purposes.includes(dto.purpose))
      ) {
        throw new BadRequestException(`الغرض ده مش مناسب لعهدة ${rule.label}`);
      }
      const amount =
        dto.amount !== undefined ? decimal(dto.amount) : before.amount;
      const issueDate =
        dto.issueDate !== undefined
          ? businessDate(dto.issueDate, 'تاريخ الصرف')
          : before.issueDate;
      const moneyChanged =
        !amount.equals(before.amount) ||
        issueDate.getTime() !== before.issueDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'CUSTODY', id, actor.id);
      const after = await tx.custody.update({
        where: { id },
        data: {
          amount,
          issueDate,
          purpose: dto.purpose,
          notes: dto.notes === undefined ? undefined : dto.notes,
        },
      });
      if (moneyChanged) await this.postIssue(tx, after, actor.id);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'custody',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Settles an open custody, or re-settles a settled one (its items replaced). The
   * rest goes back to the source account; a clearer's overspend is paid out from it.
   * The first settlement of the shipment's clearer custody computes the clearer fee.
   */
  async settle(actor: AuthUser, id: number, dto: SettleCustodyDto) {
    await this.prisma.$transaction(async (tx) => {
      await claimDocument(tx, 'CUSTODY', id, dto.version);
      const before = await tx.custody.findUniqueOrThrow({ where: { id } });
      const resettle = before.status === 'SETTLED';
      const { resetApproval } = resettle
        ? assertCanEdit(actor, {
            createdById: before.settledById!,
            approvalStatus: before.approvalStatus,
          })
        : { resetApproval: true };
      if (!resettle) this.assertAuthor(actor, before);

      const spent = dto.items.reduce((s, i) => s.plus(decimal(i.amount)), ZERO);
      const rule = HOLDERS[before.holderType];
      let extra = ZERO;
      let returned = ZERO;
      if (before.holderType === 'BANK_TRANSFER') {
        if (!spent.equals(before.amount)) {
          throw new BadRequestException(
            `في التحويل البنكي المصروف لازم يساوي المبلغ بالظبط (${formatAmount(before.amount)})`,
          );
        }
      } else if (spent.greaterThan(before.amount)) {
        if (!rule.overspend) {
          throw new BadRequestException(
            `المصروف (${formatAmount(spent)}) أكبر من العهدة (${formatAmount(before.amount)})، والصرف أكتر من العهدة مسموح للمستخلص بس`,
          );
        }
        extra = spent.minus(before.amount);
      } else {
        returned = before.amount.minus(spent);
      }
      const settlementDate = businessDate(dto.settlementDate, 'تاريخ التصفية');
      if (settlementDate < before.issueDate) {
        throw new BadRequestException(
          'تاريخ التصفية مينفعش يبقى قبل تاريخ الصرف',
        );
      }

      // the custody's lines are reversed and posted again: issue, then the rest back or the overspend out
      if (resettle)
        await this.ledger.reverseDocument(tx, 'CUSTODY', id, actor.id);
      await tx.custodyItem.deleteMany({ where: { custodyId: id } });
      await this.createItems(tx, id, dto.items);
      const after = await tx.custody.update({
        where: { id },
        data: {
          status: 'SETTLED',
          spentAmount: spent,
          extraAmount: extra,
          returnedAmount: returned,
          settlementDate,
          settledById: resettle ? before.settledById : actor.id,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (resettle) await this.postIssue(tx, after, actor.id);
      await this.postSettlement(tx, after, actor.id);
      if (after.holderType === 'CLEARER') {
        await this.fees.computeOnce(tx, after.shipmentId, after.id, actor.id);
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: resettle ? 'RESETTLE' : 'SETTLE',
          entity: 'custody',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.get(id);
  }

  // ───── helpers ─────

  private async holderFields(
    tx: Tx,
    dto: IssueCustodyDto,
    shipmentClearerId: number,
  ) {
    if (dto.holderType === 'AGENT') {
      if (!dto.agentEmployeeId) throw new BadRequestException('اختار المندوب');
      const agent = await tx.employee.findFirst({
        where: {
          id: dto.agentEmployeeId,
          department: 'AGENTS',
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      if (!agent)
        throw new BadRequestException(
          'المندوب لازم يكون موظف شغال في قسم مندوبين التوكيلات',
        );
      return { agentEmployeeId: agent.id, clearerId: null };
    }
    if (dto.agentEmployeeId)
      throw new BadRequestException('المندوب لعهدة المندوب بس');
    if (dto.holderType === 'CLEARER') {
      const clearer = await tx.clearer.findFirst({
        where: { id: shipmentClearerId, deletedAt: null, isActive: true },
      });
      if (!clearer)
        throw new BadRequestException('مستخلص الشحنة موقوف أو مش موجود');
      return { agentEmployeeId: null, clearerId: clearer.id };
    }
    return { agentEmployeeId: null, clearerId: null };
  }

  /** Agent and clearer: the EGP cash box. WAY OUT: the USD cash box. Bank transfer: the chosen bank. */
  private async sourceAccount(tx: Tx, dto: IssueCustodyDto) {
    if (dto.holderType === 'BANK_TRANSFER') {
      if (!dto.bankAccountId)
        throw new BadRequestException('اختار الحساب البنكي');
      const bank = await tx.moneyAccount.findUnique({
        where: { id: dto.bankAccountId },
      });
      if (!bank || bank.type !== 'BANK')
        throw new BadRequestException('التحويل البنكي من حساب بنكي بس');
      if (!bank.isActive) throw new BadRequestException(`${bank.name} موقوف`);
      return bank;
    }
    if (dto.bankAccountId)
      throw new BadRequestException('الحساب البنكي للتحويل البنكي بس');
    const currency = dto.holderType === 'WAY_OUT' ? 'USD' : 'EGP';
    const box = await tx.moneyAccount.findFirst({
      where: { type: 'CASH', currency },
    });
    if (!box)
      throw new BadRequestException(
        `خزنة ${currency === 'USD' ? 'الدولار' : 'الجنيه'} مش موجودة`,
      );
    return box;
  }

  private postIssue(tx: Tx, c: Custody, actorId: number) {
    return this.ledger.post(tx, {
      accountId: c.sourceAccountId,
      direction: 'OUT',
      amount: c.amount,
      date: c.issueDate,
      source: 'CUSTODY',
      documentId: c.id,
      actorId,
    });
  }

  private async postSettlement(tx: Tx, c: Custody, actorId: number) {
    const line = {
      accountId: c.sourceAccountId,
      date: c.settlementDate!,
      source: 'CUSTODY' as const,
      documentId: c.id,
      actorId,
    };
    if (c.returnedAmount.greaterThan(0)) {
      await this.ledger.post(tx, {
        ...line,
        direction: 'IN',
        amount: c.returnedAmount,
      });
    }
    if (c.extraAmount.greaterThan(0)) {
      await this.ledger.post(tx, {
        ...line,
        direction: 'OUT',
        amount: c.extraAmount,
      });
    }
  }

  private async createItems(
    tx: Tx,
    custodyId: number,
    items: CustodyItemDto[],
  ) {
    for (const [i, item] of items.entries()) {
      if (!item.receiptNo && !item.description) {
        throw new BadRequestException(
          `البند ${i + 1}: اكتب رقم الإيصال أو الوصف`,
        );
      }
      const name = item.expenseType.replace(/\s+/g, ' ').trim();
      const type = await tx.expenseType.upsert({
        where: { scope_name: { scope: 'SHIPMENT', name } },
        update: {},
        create: { scope: 'SHIPMENT', name },
      });
      await tx.custodyItem.create({
        data: {
          custodyId,
          lineNo: i + 1,
          expenseTypeId: type.id,
          amount: decimal(item.amount),
          receiptNo: item.receiptNo ?? null,
          description: item.description ?? null,
        },
      });
    }
  }

  /** Receipt numbers of this custody that also appear on another one: a warning, not an error. */
  private async duplicateReceipts(
    db: Tx | PrismaService,
    custodyId: number,
  ): Promise<DuplicateReceipt[]> {
    return db.$queryRaw<DuplicateReceipt[]>`
      SELECT DISTINCT o."receipt_no" AS "receiptNo", c."custody_no" AS "custodyNo", s."file_no" AS "fileNo"
        FROM "custody_items" mine
        JOIN "custody_items" o ON o."receipt_no" = mine."receipt_no" AND o."custody_id" <> mine."custody_id"
        JOIN "custodies" c ON c."id" = o."custody_id"
        JOIN "shipments" s ON s."id" = c."shipment_id"
       WHERE mine."custody_id" = ${custodyId}`;
  }

  /** Until approval the custody belongs to who issued it (or the CEO). */
  private assertAuthor(actor: AuthUser, c: Custody) {
    if (c.createdById !== actor.id && !can(actor, 'finance.approved.edit')) {
      throw new ForbiddenException('العهدة دي بيتعامل معاها اللي صرفها');
    }
  }
}
