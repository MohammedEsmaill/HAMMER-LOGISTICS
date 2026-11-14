import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import { claimDocument } from './document-version';
import {
  CreateCollectionDto,
  UpdateCollectionDto,
} from './dto/shipment-account.dto';
import { LedgerService } from './ledger.service';
import { decimal, formatAmount } from './money';
import { ShipmentAccountService } from './shipment-account.service';
import { assertDayEditable, openDate } from './days';
import { DOCUMENT_INCLUDE } from './transfers.service';

const ZERO = new Prisma.Decimal(0);

/**
 * Collections from clients (spec section 14), in the invoice currency: cash into the
 * cash box of that currency, or a transfer into a bank account of it. The balance and
 * the shipment payment status change in the same transaction.
 */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly accounts: ShipmentAccountService,
    private readonly audit: AuditService,
  ) {}

  async get(id: number) {
    const c = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        shipment: { select: { id: true, fileNo: true } },
        account: {
          select: { id: true, name: true, type: true, currency: true },
        },
        ...DOCUMENT_INCLUDE,
      },
    });
    if (!c) throw new NotFoundException('التحصيل غير موجود');
    return c;
  }

  async create(actor: AuthUser, dto: CreateCollectionDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: dto.shipmentId },
        select: { id: true, clientId: true },
      });
      if (!shipment) throw new NotFoundException('الشحنة غير موجودة');
      await tx.$queryRaw`SELECT 1 FROM "shipment_accounts" WHERE "shipment_id" = ${shipment.id} FOR UPDATE`;
      const amount = decimal(dto.amount);
      await this.assertWithinOutstanding(tx, shipment.id, dto.currency, amount);
      const account = await this.receivingAccount(tx, dto);
      const collection = await tx.collection.create({
        data: {
          clientId: shipment.clientId,
          shipmentId: shipment.id,
          currency: dto.currency,
          amount,
          method: dto.method,
          accountId: account.id,
          collectionDate: await openDate(
            tx,
            dto.collectionDate,
            'تاريخ التحصيل',
          ),
          reference: dto.reference,
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.post(
        tx,
        collection.id,
        account.id,
        amount,
        collection.collectionDate,
        actor.id,
      );
      await this.accounts.recomputePayment(tx, shipment.id);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'collection',
          entityId: collection.id,
          after: collection,
        },
        tx,
      );
      return collection.id;
    });
    return this.get(id);
  }

  async update(actor: AuthUser, id: number, dto: UpdateCollectionDto) {
    await this.prisma.$transaction(async (tx) => {
      await claimDocument(tx, 'COLLECTION', id, dto.version);
      const before = await tx.collection.findUniqueOrThrow({ where: { id } });
      const { resetApproval } = assertCanEdit(actor, before);
      await assertDayEditable(tx, actor, before.collectionDate);
      const amount =
        dto.amount !== undefined ? decimal(dto.amount) : before.amount;
      await this.assertWithinOutstanding(
        tx,
        before.shipmentId,
        before.currency,
        amount.minus(before.amount),
      );
      const collectionDate =
        dto.collectionDate !== undefined
          ? await openDate(tx, dto.collectionDate, 'تاريخ التحصيل', actor)
          : before.collectionDate;
      const moneyChanged =
        !amount.equals(before.amount) ||
        collectionDate.getTime() !== before.collectionDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'COLLECTION', id, actor.id);
      const after = await tx.collection.update({
        where: { id },
        data: {
          amount,
          collectionDate,
          reference: dto.reference === undefined ? undefined : dto.reference,
          notes: dto.notes === undefined ? undefined : dto.notes,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged)
        await this.post(
          tx,
          id,
          after.accountId,
          amount,
          collectionDate,
          actor.id,
        );
      await this.accounts.recomputePayment(tx, before.shipmentId);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'collection',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Never more than the live invoices of that currency still owe. */
  private async assertWithinOutstanding(
    tx: Tx,
    shipmentId: number,
    currency: Currency,
    extra: Prisma.Decimal,
  ) {
    const [billed, collected] = await Promise.all([
      tx.invoice.aggregate({
        where: { shipmentId, currency, voidedAt: null },
        _sum: { total: true },
      }),
      tx.collection.aggregate({
        where: { shipmentId, currency },
        _sum: { amount: true },
      }),
    ]);
    const due = billed._sum.total ?? ZERO;
    if (due.isZero()) {
      throw new BadRequestException(
        `مفيش فواتير ${currency === 'USD' ? 'بالدولار' : 'بالجنيه'} على الشحنة دي لسه`,
      );
    }
    const outstanding = due.minus(collected._sum.amount ?? ZERO);
    if (extra.greaterThan(outstanding)) {
      throw new BadRequestException(
        `المبلغ أكبر من المتبقي على الشحنة (${formatAmount(outstanding)} ${currency})`,
      );
    }
  }

  private async receivingAccount(tx: Tx, dto: CreateCollectionDto) {
    if (dto.method === 'CASH') {
      if (dto.bankAccountId)
        throw new BadRequestException('التحصيل الكاش بيدخل الخزنة');
      const box = await tx.moneyAccount.findFirst({
        where: { type: 'CASH', currency: dto.currency },
      });
      if (!box) throw new BadRequestException('الخزنة مش موجودة');
      return box;
    }
    if (!dto.bankAccountId)
      throw new BadRequestException('اختار الحساب البنكي اللي استلم التحويل');
    const bank = await tx.moneyAccount.findUnique({
      where: { id: dto.bankAccountId },
    });
    if (!bank || bank.type !== 'BANK')
      throw new BadRequestException('التحويل بيدخل حساب بنكي');
    if (!bank.isActive) throw new BadRequestException(`${bank.name} موقوف`);
    if (bank.currency !== dto.currency)
      throw new BadRequestException(
        'الحساب البنكي لازم يبقى بنفس عملة الفاتورة',
      );
    return bank;
  }

  private post(
    tx: Tx,
    id: number,
    accountId: number,
    amount: Prisma.Decimal,
    date: Date,
    actorId: number,
  ) {
    return this.ledger.post(tx, {
      accountId,
      direction: 'IN',
      amount,
      date,
      source: 'COLLECTION',
      documentId: id,
      actorId,
    });
  }
}
