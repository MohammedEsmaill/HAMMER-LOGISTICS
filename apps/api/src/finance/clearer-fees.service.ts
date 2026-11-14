import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Shipment } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import { claimDocument } from './document-version';
import {
  AdjustFeeDto,
  FeesQueryDto,
  PayFeeDto,
  UpdateFeePaymentDto,
} from './dto/custody.dto';
import { LedgerService } from './ledger.service';
import { FEE_RATE_PORTS } from './prices.service';
import { decimal, formatAmount, todayCairo } from './money';
import { payableBeneficiary } from './beneficiaries.service';
import { egpCashBox, egpPayingAccount } from './paying-account';
import { assertDayEditable, openDate } from './days';
import { DOCUMENT_INCLUDE } from './transfers.service';

const ZERO = new Prisma.Decimal(0);

type FeeShipment = Pick<
  Shipment,
  'direction' | 'mode' | 'loadType' | 'containersCount' | 'customsRegime'
>;

/** Containers that count for the fee: FCL sea shipments count each; the rest count one. */
export function feeContainers(s: FeeShipment): number {
  return s.mode === 'SEA' && s.loadType === 'FCL'
    ? Math.max(s.containersCount ?? 1, 1)
    : 1;
}

/**
 * The clearer's fee (spec section 13): the base for the shipment type and regime, plus
 * the extra-container price for every FCL container after the first.
 */
@Injectable()
export class ClearerFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Computes the shipment's fee once, with the first settlement of its clearer's
   * custody; later settlements find it there. Prices are stored as they are now.
   */
  async computeOnce(
    tx: Tx,
    shipmentId: number,
    custodyId: number,
    actorId: number,
  ) {
    const existing = await tx.clearerFee.findUnique({ where: { shipmentId } });
    if (existing) return existing;
    const shipment = await tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { clearer: true, dischargePort: { select: { code: true } } },
    });
    const c = shipment.clearer;
    const fcl = shipment.mode === 'SEA' && shipment.loadType === 'FCL';
    // sea imports through Alexandria / El Dekheila: the office price list, by regime;
    // everything else: the clearer's own prices
    const listed =
      shipment.direction === 'IMPORT' &&
      shipment.mode === 'SEA' &&
      FEE_RATE_PORTS.includes(shipment.dischargePort?.code ?? '');
    const rate = listed
      ? await tx.clearerFeeRate.findUnique({
          where: { regime: shipment.customsRegime ?? 'FINAL' },
        })
      : null;
    const base = rate
      ? rate.firstContainer
      : shipment.direction === 'EXPORT'
        ? c.exportBase
        : shipment.customsRegime === 'TEMPORARY'
          ? c.importTemporaryBase
          : c.importFinalBase;
    const extraRate = !fcl
      ? ZERO
      : rate
        ? rate.extraContainer
        : shipment.direction === 'EXPORT'
          ? c.exportExtraContainer
          : c.importExtraContainer;
    const containersCount = feeContainers(shipment);
    const amount = new Prisma.Decimal(base).plus(
      new Prisma.Decimal(extraRate).times(containersCount - 1),
    );
    const fee = await tx.clearerFee.create({
      data: {
        shipmentId,
        clearerId: c.id,
        custodyId,
        base,
        extraRate,
        containersCount,
        amount,
        computedById: actorId,
      },
    });
    await this.audit.log(
      {
        userId: actorId,
        action: 'CREATE',
        entity: 'clearer_fee',
        entityId: fee.id,
        after: fee,
      },
      tx,
    );
    return fee;
  }

  /**
   * Called by the shipment edit, in its transaction: the clearer cannot change once
   * the fee is computed, and a new containers count adjusts the fee by
   * (new − old) × the extra-container price it was computed with.
   */
  async onShipmentEdited(
    tx: Tx,
    actor: AuthUser,
    before: FeeShipment & { id: number; clearerId: number },
    after: FeeShipment & { clearerId: number },
  ) {
    const fee = await tx.clearerFee.findUnique({
      where: { shipmentId: before.id },
    });
    if (!fee) return;
    if (after.clearerId !== before.clearerId) {
      throw new BadRequestException(
        'أتعاب المستخلص اتحسبت على الشحنة دي، فمستخلص الشحنة مايتغيرش. أي تصحيح بتسوية من المدير التنفيذي',
      );
    }
    const from = fee.containersCount;
    const to = feeContainers(after);
    if (from === to) return;
    await tx.clearerFee.update({
      where: { id: fee.id },
      data: {
        containersCount: to,
        amount: fee.base.plus(fee.extraRate.times(to - 1)),
      },
    });
    const amount = fee.extraRate.times(to - from);
    if (amount.isZero()) return;
    const adjustment = await tx.clearerFeeAdjustment.create({
      data: {
        feeId: fee.id,
        amount,
        reason: 'CONTAINERS_CHANGED',
        containersFrom: from,
        containersTo: to,
        adjustmentDate: todayCairo(),
        createdById: actor.id,
      },
    });
    await this.audit.log(
      {
        userId: actor.id,
        action: 'CREATE',
        entity: 'clearer_fee_adjustment',
        entityId: adjustment.id,
        after: adjustment,
      },
      tx,
    );
  }

  /** A fee with what was adjusted and paid, and what is left to pay. */
  private async summary(db: Tx | PrismaService, feeId: number) {
    const fee = await db.clearerFee.findUnique({
      where: { id: feeId },
      include: {
        clearer: { select: { id: true, fullName: true } },
        shipment: {
          select: {
            id: true,
            fileNo: true,
            direction: true,
            mode: true,
            loadType: true,
            customsRegime: true,
          },
        },
        custody: { select: { id: true, custodyNo: true } },
        adjustments: {
          orderBy: { id: 'asc' },
          include: { createdBy: { select: { id: true, email: true } } },
        },
        payments: {
          orderBy: { id: 'asc' },
          include: {
            createdBy: { select: { id: true, email: true } },
            account: { select: { id: true, name: true, type: true } },
            beneficiary: {
              select: {
                id: true,
                name: true,
                bankName: true,
                accountNumber: true,
              },
            },
          },
        },
      },
    });
    if (!fee) throw new NotFoundException('الأتعاب غير موجودة');
    // the fee row holds the current containers count; the original amount is base + rate × (first count − 1)
    const adjusted = fee.adjustments.reduce((s, a) => s.plus(a.amount), ZERO);
    const original = fee.amount.minus(
      fee.adjustments
        .filter((a) => a.reason === 'CONTAINERS_CHANGED')
        .reduce((s, a) => s.plus(a.amount), ZERO),
    );
    const total = original.plus(adjusted);
    const paid = fee.payments.reduce((s, p) => s.plus(p.amount), ZERO);
    return { ...fee, original, total, paid, remaining: total.minus(paid) };
  }

  get(feeId: number) {
    return this.summary(this.prisma, feeId);
  }

  async list(q: FeesQueryDto) {
    const where: Prisma.ClearerFeeWhereInput = {
      clearerId: q.clearerId,
      shipmentId: q.shipmentId,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.clearerFee.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.clearerFee.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map((r) => this.summary(this.prisma, r.id)),
    );
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  // ───── payments (installments, from the EGP cash box) ─────

  async getPayment(id: number) {
    const payment = await this.prisma.clearerFeePayment.findUnique({
      where: { id },
      include: {
        fee: {
          select: {
            id: true,
            clearer: { select: { id: true, fullName: true } },
            shipment: { select: { id: true, fileNo: true } },
          },
        },
        account: {
          select: { id: true, name: true, type: true, currency: true },
        },
        beneficiary: {
          select: { id: true, name: true, bankName: true, accountNumber: true },
        },
        ...DOCUMENT_INCLUDE,
      },
    });
    if (!payment) throw new NotFoundException('صرف الأتعاب غير موجود');
    return payment;
  }

  async pay(actor: AuthUser, dto: PayFeeDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.lockFee(tx, dto.feeId);
      const fee = await this.summary(tx, dto.feeId);
      const amount = decimal(dto.amount);
      if (amount.greaterThan(fee.remaining)) {
        throw new BadRequestException(
          `المبلغ أكبر من الباقي من الأتعاب (${formatAmount(fee.remaining)} ج)`,
        );
      }
      // cash from the EGP box, or a transfer from an EGP bank into the clearer's own account
      const box = dto.accountId
        ? await egpPayingAccount(tx, dto.accountId)
        : await egpCashBox(tx);
      if (box.type === 'BANK') {
        if (!dto.beneficiaryId)
          throw new BadRequestException('اختار حساب المستخلص اللي هتحوّل له');
        await payableBeneficiary(tx, dto.beneficiaryId, fee.clearerId);
      } else if (dto.beneficiaryId || dto.transferRef) {
        throw new BadRequestException(
          'حساب المستخلص ورقم التحويل للتحويل البنكي بس',
        );
      }
      const payment = await tx.clearerFeePayment.create({
        data: {
          feeId: fee.id,
          amount,
          accountId: box.id,
          beneficiaryId: dto.beneficiaryId ?? null,
          transferRef: dto.transferRef?.toUpperCase() ?? null,
          paymentDate: await openDate(tx, dto.paymentDate, 'تاريخ الصرف'),
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.ledger.post(tx, {
        accountId: box.id,
        direction: 'OUT',
        amount,
        date: payment.paymentDate,
        source: 'FEE_PAYMENT',
        documentId: payment.id,
        actorId: actor.id,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'clearer_fee_payment',
          entityId: payment.id,
          after: payment,
        },
        tx,
      );
      return payment.id;
    });
    return this.getPayment(id);
  }

  async updatePayment(actor: AuthUser, id: number, dto: UpdateFeePaymentDto) {
    await this.prisma.$transaction(async (tx) => {
      await claimDocument(tx, 'FEE_PAYMENT', id, dto.version);
      const before = await tx.clearerFeePayment.findUniqueOrThrow({
        where: { id },
      });
      const { resetApproval } = assertCanEdit(actor, before);
      await assertDayEditable(tx, actor, before.paymentDate);
      await this.lockFee(tx, before.feeId);
      const amount =
        dto.amount !== undefined ? decimal(dto.amount) : before.amount;
      const fee = await this.summary(tx, before.feeId);
      // this payment's own amount is available again while it is being edited
      if (amount.greaterThan(fee.remaining.plus(before.amount))) {
        throw new BadRequestException(
          `المبلغ أكبر من الباقي من الأتعاب (${formatAmount(fee.remaining.plus(before.amount))} ج)`,
        );
      }
      const paymentDate =
        dto.paymentDate !== undefined
          ? await openDate(tx, dto.paymentDate, 'تاريخ الصرف', actor)
          : before.paymentDate;
      const moneyChanged =
        !amount.equals(before.amount) ||
        paymentDate.getTime() !== before.paymentDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'FEE_PAYMENT', id, actor.id);
      const after = await tx.clearerFeePayment.update({
        where: { id },
        data: {
          amount,
          paymentDate,
          notes: dto.notes === undefined ? undefined : dto.notes,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged) {
        await this.ledger.post(tx, {
          accountId: after.accountId,
          direction: 'OUT',
          amount,
          date: paymentDate,
          source: 'FEE_PAYMENT',
          documentId: id,
          actorId: actor.id,
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'clearer_fee_payment',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.getPayment(id);
  }

  // ───── CEO adjustments ─────

  async adjust(actor: AuthUser, dto: AdjustFeeDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockFee(tx, dto.feeId);
      const fee = await this.summary(tx, dto.feeId);
      const amount = decimal(dto.amount);
      if (fee.total.plus(amount).lessThan(fee.paid)) {
        throw new BadRequestException(
          `التسوية هتخلي الأتعاب أقل من اللي اتصرف بالفعل (${formatAmount(fee.paid)} ج)`,
        );
      }
      const adjustment = await tx.clearerFeeAdjustment.create({
        data: {
          feeId: fee.id,
          amount,
          reason: 'CEO_OVERRIDE',
          notes: dto.notes,
          adjustmentDate: todayCairo(),
          createdById: actor.id,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'clearer_fee_adjustment',
          entityId: adjustment.id,
          after: adjustment,
        },
        tx,
      );
    });
    return this.get(dto.feeId);
  }

  async getAdjustment(id: number) {
    const adjustment = await this.prisma.clearerFeeAdjustment.findUnique({
      where: { id },
      include: {
        fee: {
          select: {
            id: true,
            clearer: { select: { id: true, fullName: true } },
            shipment: { select: { id: true, fileNo: true } },
          },
        },
        ...DOCUMENT_INCLUDE,
      },
    });
    if (!adjustment) throw new NotFoundException('التسوية غير موجودة');
    return adjustment;
  }

  private async lockFee(tx: Tx, id: number) {
    const [row] = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "clearer_fees" WHERE "id" = ${id} FOR UPDATE`;
    if (!row) throw new NotFoundException('الأتعاب غير موجودة');
  }
}
