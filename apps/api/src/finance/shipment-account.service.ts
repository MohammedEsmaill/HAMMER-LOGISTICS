import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  CustodyItem,
  Prisma,
  ReceiptKind,
  ShipmentAccount,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, can } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import {
  AccountsQueryDto,
  ExtraLineDto,
  FinishDto,
  ReopenDto,
  StatementOverrideDto,
} from './dto/shipment-account.dto';
import { businessDate, decimal } from './money';

const ZERO = new Prisma.Decimal(0);
const VAT_RATE = new Prisma.Decimal(10);
const CURRENCIES: Currency[] = ['EGP', 'USD'];

/** The statement line a receipt prints as (from the office's current statements). */
const RECEIPT_LINE: Record<ReceiptKind, (no: string) => string> = {
  PAYMENT_RECEIPT: (no) => `PAYMENT RECEIPT NO-${no}`,
  PAYMENT: (no) => `PAYMENT NO ${no}`,
  VAT: (no) => `VAT NO-${no}`,
};

export function defaultLine(
  item: Pick<CustodyItem, 'receiptNo' | 'receiptKind' | 'description'> & {
    expenseType: { name: string };
  },
) {
  if (item.receiptNo)
    return RECEIPT_LINE[item.receiptKind ?? 'PAYMENT_RECEIPT'](item.receiptNo);
  return item.description ?? item.expenseType.name;
}

export interface DraftLine {
  source: 'ITEM' | 'EXTRA';
  id: number;
  description: string;
  defaultDescription?: string;
  amount: Prisma.Decimal;
  actualAmount?: Prisma.Decimal;
  excluded: boolean;
  overridden: boolean;
  custodyNo?: string;
  expenseType?: string;
}

const SHIPMENT_HEADER = {
  id: true,
  fileNo: true,
  direction: true,
  mode: true,
  loadType: true,
  customsRegime: true,
  containersCount: true,
  hblNumber: true,
  mblNumber: true,
  vesselName: true,
  commodity: true,
  consignee: true,
  certificateNo: true,
  releaseDate: true,
  totalWeight: true,
  clientId: true,
  client: {
    select: {
      id: true,
      name: true,
      quoteFinalBase: true,
      quoteTemporaryBase: true,
      quoteImportExtraContainer: true,
      quoteExportBase: true,
      quoteExportExtraContainer: true,
    },
  },
  loadingPort: { select: { name: true } },
  dischargePort: { select: { name: true } },
  freeZone: { select: { name: true } },
  containers: {
    select: { containerNo: true, type: true },
    orderBy: { seq: 'asc' },
  },
} satisfies Prisma.ShipmentSelect;

type HeaderShipment = Prisma.ShipmentGetPayload<{
  select: typeof SHIPMENT_HEADER;
}>;

const INVOICE_INCLUDE = {
  lines: { orderBy: { lineNo: 'asc' } },
  createdBy: { select: { id: true, email: true } },
  voidedBy: { select: { id: true, email: true } },
} satisfies Prisma.InvoiceInclude;

/**
 * The shipment account (spec section 14): the actual expenses are the custody
 * items; the client statement is built from them (drop / re-word / re-price / add
 * lines), and "finish" freezes it into STATEMENT (EGP, USD) and CLEARANCE invoices.
 */
@Injectable()
export class ShipmentAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───── reading ─────

  async list(q: AccountsQueryDto) {
    const where: Prisma.ShipmentWhereInput = {
      clientId: q.clientId,
      ...(q.status === 'FINISHED' ? { account: { status: 'FINISHED' } } : {}),
      ...(q.status === 'OPEN'
        ? { OR: [{ account: null }, { account: { status: 'OPEN' } }] }
        : {}),
      ...(q.paymentStatus
        ? {
            account: {
              paymentStatus: q.paymentStatus,
              ...(q.status ? { status: q.status } : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            AND: [
              {
                OR: [
                  { fileNo: { contains: q.search.toUpperCase() } },
                  {
                    client: {
                      name: { contains: q.search, mode: 'insensitive' },
                    },
                  },
                  { certificateNo: { contains: q.search } },
                ],
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where,
        select: {
          id: true,
          fileNo: true,
          direction: true,
          mode: true,
          certificateNo: true,
          client: { select: { id: true, name: true } },
          account: true,
          custodies: {
            select: { status: true, currency: true, spentAmount: true },
          },
          invoices: {
            where: { voidedAt: null },
            select: {
              type: true,
              currency: true,
              total: true,
              invoiceNo: true,
              approvalStatus: true,
            },
          },
          collections: { select: { currency: true, amount: true } },
        },
        orderBy: { id: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.shipment.count({ where }),
    ]);
    const items = rows.map((s) => ({
      id: s.id,
      fileNo: s.fileNo,
      direction: s.direction,
      mode: s.mode,
      certificateNo: s.certificateNo,
      client: s.client,
      status: s.account?.status ?? 'OPEN',
      paymentStatus: s.account?.paymentStatus ?? 'UNPAID',
      openCustodies: s.custodies.filter((c) => c.status === 'OPEN').length,
      invoices: s.invoices,
      totals: CURRENCIES.map((currency) => ({
        currency,
        actual: s.custodies
          .filter((c) => c.currency === currency)
          .reduce((t, c) => t.plus(c.spentAmount), ZERO),
        billed: s.invoices
          .filter((i) => i.currency === currency)
          .reduce((t, i) => t.plus(i.total), ZERO),
        collected: s.collections
          .filter((c) => c.currency === currency)
          .reduce((t, c) => t.plus(c.amount), ZERO),
      })),
    }));
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(shipmentId: number) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: SHIPMENT_HEADER,
    });
    if (!shipment) throw new NotFoundException('الشحنة غير موجودة');
    const [account, draft, custodies, invoices, collections, fee] =
      await Promise.all([
        this.prisma.shipmentAccount.findUnique({ where: { shipmentId } }),
        this.draft(this.prisma, shipmentId),
        this.prisma.custody.findMany({
          where: { shipmentId },
          select: {
            id: true,
            custodyNo: true,
            status: true,
            currency: true,
            amount: true,
            spentAmount: true,
            holderType: true,
            approvalStatus: true,
          },
          orderBy: { id: 'asc' },
        }),
        this.prisma.invoice.findMany({
          where: { shipmentId },
          include: INVOICE_INCLUDE,
          orderBy: { id: 'desc' },
        }),
        this.prisma.collection.findMany({
          where: { shipmentId },
          include: {
            account: { select: { id: true, name: true, type: true } },
            createdBy: { select: { id: true, email: true } },
          },
          orderBy: { id: 'desc' },
        }),
        this.prisma.clearerFee.findUnique({
          where: { shipmentId },
          select: {
            id: true,
            amount: true,
            clearer: { select: { fullName: true } },
          },
        }),
      ]);
    const live = invoices.filter((i) => !i.voidedAt);
    const clearance = this.clearanceQuote(shipment);
    return {
      shipment: this.header(shipment),
      account: account ?? {
        shipmentId,
        status: 'OPEN',
        paymentStatus: 'UNPAID',
        version: 0,
        reopenCount: 0,
        finishedAt: null,
        notes: null,
      },
      custodies,
      openCustodies: custodies
        .filter((c) => c.status === 'OPEN')
        .map((c) => c.custodyNo),
      draft,
      clearanceQuote: clearance,
      invoices,
      collections,
      clearerFee: fee,
      totals: CURRENCIES.map((currency) => {
        const billed = live
          .filter((i) => i.currency === currency)
          .reduce((t, i) => t.plus(i.total), ZERO);
        const collected = collections
          .filter((c) => c.currency === currency)
          .reduce((t, c) => t.plus(c.amount), ZERO);
        return {
          currency,
          actual: draft[currency].actualTotal,
          statement: draft[currency].total,
          billed,
          collected,
          outstanding: billed.minus(collected),
        };
      }),
    };
  }

  /** One invoice, with the shipment header it prints with and its approval trail. */
  async invoice(id: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        ...INVOICE_INCLUDE,
        reviewedBy: { select: { id: true, email: true } },
        managerBy: { select: { id: true, email: true } },
        approvedBy: { select: { id: true, email: true } },
        rejectedBy: { select: { id: true, email: true } },
      },
    });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    const shipment = await this.prisma.shipment.findUniqueOrThrow({
      where: { id: invoice.shipmentId },
      select: SHIPMENT_HEADER,
    });
    return { ...invoice, shipment: this.header(shipment) };
  }

  /** The client statement as it stands: settled custody items with their overrides, then the extra lines. */
  async draft(db: Tx | PrismaService, shipmentId: number) {
    const [items, extras] = await Promise.all([
      db.custodyItem.findMany({
        where: { custody: { shipmentId, status: 'SETTLED' } },
        include: {
          statementOverride: true,
          expenseType: { select: { name: true } },
          custody: { select: { custodyNo: true, currency: true } },
        },
        orderBy: [{ custodyId: 'asc' }, { lineNo: 'asc' }],
      }),
      db.statementExtraLine.findMany({
        where: { shipmentId },
        orderBy: { id: 'asc' },
      }),
    ]);
    const result = {} as Record<
      Currency,
      { lines: DraftLine[]; total: Prisma.Decimal; actualTotal: Prisma.Decimal }
    >;
    for (const currency of CURRENCIES) {
      const lines: DraftLine[] = [
        ...items
          .filter((i) => i.custody.currency === currency)
          .map((i) => {
            const o = i.statementOverride;
            const fallback = defaultLine(i);
            return {
              source: 'ITEM' as const,
              id: i.id,
              description: o?.description ?? fallback,
              defaultDescription: fallback,
              amount: o?.amount ?? i.amount,
              actualAmount: i.amount,
              excluded: o?.excluded ?? false,
              overridden:
                !!o &&
                (o.excluded || o.description !== null || o.amount !== null),
              custodyNo: i.custody.custodyNo,
              expenseType: i.expenseType.name,
            };
          }),
        ...extras
          .filter((e) => e.currency === currency)
          .map((e) => ({
            source: 'EXTRA' as const,
            id: e.id,
            description: e.description,
            amount: e.amount,
            excluded: false,
            overridden: false,
          })),
      ];
      result[currency] = {
        lines,
        total: lines
          .filter((l) => !l.excluded)
          .reduce((t, l) => t.plus(l.amount), ZERO),
        actualTotal: items
          .filter((i) => i.custody.currency === currency)
          .reduce((t, i) => t.plus(i.amount), ZERO),
      };
    }
    return result;
  }

  // ───── editing the client statement (while the account is open) ─────

  async setOverride(
    actor: AuthUser,
    itemId: number,
    dto: StatementOverrideDto,
  ) {
    const shipmentId = await this.prisma.$transaction(async (tx) => {
      const item = await tx.custodyItem.findUnique({
        where: { id: itemId },
        include: { custody: true },
      });
      if (!item) throw new NotFoundException('البند غير موجود');
      await this.assertOpen(tx, item.custody.shipmentId);
      const before = await tx.statementOverride.findUnique({
        where: { custodyItemId: itemId },
      });
      const data = {
        excluded: dto.excluded ?? before?.excluded ?? false,
        description:
          dto.description === undefined
            ? (before?.description ?? null)
            : dto.description || null,
        amount:
          dto.amount === undefined
            ? (before?.amount ?? null)
            : dto.amount === null
              ? null
              : decimal(dto.amount),
      };
      const after = await tx.statementOverride.upsert({
        where: { custodyItemId: itemId },
        update: { ...data, updatedById: actor.id },
        create: { custodyItemId: itemId, ...data, updatedById: actor.id },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'statement_override',
          entityId: itemId,
          before,
          after,
        },
        tx,
      );
      return item.custody.shipmentId;
    });
    return this.get(shipmentId);
  }

  async addExtra(actor: AuthUser, shipmentId: number, dto: ExtraLineDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertOpen(tx, shipmentId);
      const line = await tx.statementExtraLine.create({
        data: {
          shipmentId,
          currency: dto.currency,
          description: dto.description,
          amount: decimal(dto.amount),
          createdById: actor.id,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'statement_extra_line',
          entityId: line.id,
          after: line,
        },
        tx,
      );
    });
    return this.get(shipmentId);
  }

  async removeExtra(actor: AuthUser, id: number) {
    const shipmentId = await this.prisma.$transaction(async (tx) => {
      const line = await tx.statementExtraLine.findUnique({ where: { id } });
      if (!line) throw new NotFoundException('البند غير موجود');
      await this.assertOpen(tx, line.shipmentId);
      await tx.statementExtraLine.delete({ where: { id } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'statement_extra_line',
          entityId: id,
          before: line,
        },
        tx,
      );
      return line.shipmentId;
    });
    return this.get(shipmentId);
  }

  // ───── finish / reopen ─────

  /**
   * "إنهاء": refused while a custody is open; warns (409) when the certificate number
   * is missing unless confirmed. Freezes the statement into STATEMENT invoices (one
   * per currency with lines) and issues the CLEARANCE invoice from the client quote.
   */
  async finish(actor: AuthUser, shipmentId: number, dto: FinishDto) {
    await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, shipmentId);
      this.checkVersion(account, dto.version);
      if (account.status === 'FINISHED')
        throw new BadRequestException('حساب الشحنة منتهي بالفعل');
      const open = await tx.custody.findMany({
        where: { shipmentId, status: 'OPEN' },
        select: { custodyNo: true },
      });
      if (open.length) {
        throw new BadRequestException(
          `فيه عهد لسه ما اتصفتش: ${open.map((c) => c.custodyNo).join('، ')}`,
        );
      }
      const shipment = await tx.shipment.findUniqueOrThrow({
        where: { id: shipmentId },
        select: SHIPMENT_HEADER,
      });
      if (!shipment.certificateNo && !dto.confirmNoCertificate) {
        throw new ConflictException(
          'رقم الشهادة مش متسجل، والـ STATEMENT هياخد رقم الملف. أكّد علشان تكمل',
        );
      }
      const invoiceDate = businessDate(dto.invoiceDate, 'تاريخ الفاتورة');
      const common = {
        shipmentId,
        invoiceDate,
        valueDate: dto.valueDate ?? invoiceDate,
        customerRef: dto.customerRef ?? null,
        createdById: actor.id,
      };

      const draft = await this.draft(tx, shipmentId);
      for (const currency of CURRENCIES) {
        const lines = draft[currency].lines.filter((l) => !l.excluded);
        if (!lines.length) continue;
        const subtotal = lines.reduce((t, l) => t.plus(l.amount), ZERO);
        await tx.invoice.create({
          data: {
            ...common,
            type: 'STATEMENT',
            currency,
            invoiceNo: await this.statementNo(
              tx,
              shipment,
              currency,
              invoiceDate,
            ),
            subtotal,
            total: subtotal,
            lines: {
              create: lines.map((l, i) => ({
                lineNo: i + 1,
                description: l.description,
                quantity: 1,
                unitPrice: l.amount,
                total: l.amount,
                custodyItemId: l.source === 'ITEM' ? l.id : null,
              })),
            },
          },
        });
      }

      const quote = this.clearanceQuote(shipment);
      const clearanceLines = [
        {
          description: 'CLEARANCE',
          quantity: new Prisma.Decimal(1),
          unitPrice: quote.amount,
        },
        ...(dto.clearanceLines ?? []).map((l) => ({
          description: l.description,
          quantity: new Prisma.Decimal(l.quantity),
          unitPrice: decimal(l.unitPrice),
        })),
      ].map((l, i) => ({
        ...l,
        lineNo: i + 1,
        total: l.quantity.times(l.unitPrice).toDecimalPlaces(2),
      }));
      const subtotal = clearanceLines.reduce((t, l) => t.plus(l.total), ZERO);
      const vatAmount = subtotal
        .times(VAT_RATE)
        .dividedBy(100)
        .toDecimalPlaces(2);
      const { invoiceNo, cycle } = await this.clearanceNo(tx, shipmentId);
      await tx.invoice.create({
        data: {
          ...common,
          type: 'CLEARANCE',
          currency: 'EGP',
          invoiceNo,
          cycle,
          subtotal,
          vatRate: VAT_RATE,
          vatAmount,
          wht: ZERO,
          total: subtotal.plus(vatAmount),
          lines: { create: clearanceLines },
        },
      });

      await tx.shipmentAccount.update({
        where: { shipmentId },
        data: {
          status: 'FINISHED',
          finishedAt: new Date(),
          finishedById: actor.id,
          version: { increment: 1 },
        },
      });
      await this.recomputePayment(tx, shipmentId);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'FINISH',
          entity: 'shipment_account',
          entityId: shipmentId,
          before: account,
        },
        tx,
      );
    });
    return this.get(shipmentId);
  }

  /**
   * Reopens a finished account: the accountant while nothing is paid, the financial
   * relations manager once anything is. The invoices are voided (kept in the record);
   * the next finish reissues them with the same numbers.
   */
  async reopen(actor: AuthUser, shipmentId: number, dto: ReopenDto) {
    await this.prisma.$transaction(async (tx) => {
      const account = await this.lockAccount(tx, shipmentId);
      this.checkVersion(account, dto.version);
      if (account.status !== 'FINISHED')
        throw new BadRequestException('حساب الشحنة مفتوح بالفعل');
      const allowed =
        account.paymentStatus === 'UNPAID'
          ? can(actor, 'finance.statement.manage')
          : can(actor, 'finance.collections.manage');
      if (!allowed) {
        throw new ForbiddenException(
          account.paymentStatus === 'UNPAID'
            ? 'إعادة فتح الحساب للمحاسب'
            : 'الشحنة عليها تحصيل، وإعادة فتحها لمدير العلاقات المالية بس',
        );
      }
      await tx.invoice.updateMany({
        where: { shipmentId, voidedAt: null },
        data: {
          voidedAt: new Date(),
          voidedById: actor.id,
          notes: `اتلغت بإعادة فتح الحساب: ${dto.reason}`,
        },
      });
      await tx.shipmentAccount.update({
        where: { shipmentId },
        data: {
          status: 'OPEN',
          reopenCount: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await this.recomputePayment(tx, shipmentId);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'REOPEN',
          entity: 'shipment_account',
          entityId: shipmentId,
          before: account,
          after: { reason: dto.reason },
        },
        tx,
      );
    });
    return this.get(shipmentId);
  }

  /**
   * UNPAID → PARTIAL → PAID, from the live invoices and the collections, per currency;
   * PAID only when every currency billed is fully collected.
   */
  async recomputePayment(tx: Tx, shipmentId: number) {
    const [invoices, collections] = await Promise.all([
      tx.invoice.groupBy({
        by: ['currency'],
        where: { shipmentId, voidedAt: null },
        _sum: { total: true },
      }),
      tx.collection.groupBy({
        by: ['currency'],
        where: { shipmentId },
        _sum: { amount: true },
      }),
    ]);
    const collected = (c: Currency) =>
      collections.find((x) => x.currency === c)?._sum.amount ?? ZERO;
    const anyCollected = collections.some((c) =>
      (c._sum.amount ?? ZERO).greaterThan(0),
    );
    const allPaid =
      invoices.length > 0 &&
      invoices.every((i) =>
        collected(i.currency).greaterThanOrEqualTo(i._sum.total ?? ZERO),
      );
    const paymentStatus = allPaid
      ? 'PAID'
      : anyCollected
        ? 'PARTIAL'
        : 'UNPAID';
    await tx.shipmentAccount.upsert({
      where: { shipmentId },
      update: { paymentStatus },
      create: { shipmentId, paymentStatus },
    });
  }

  // ───── helpers ─────

  /** The CLEARANCE line from the client quote: base by direction and regime, + the extra container price for each FCL container after the first. */
  clearanceQuote(s: HeaderShipment) {
    const q = s.client;
    const fcl = s.mode === 'SEA' && s.loadType === 'FCL';
    const containers = fcl ? Math.max(s.containersCount ?? 1, 1) : 1;
    const base =
      s.direction === 'EXPORT'
        ? q.quoteExportBase
        : s.customsRegime === 'TEMPORARY'
          ? q.quoteTemporaryBase
          : q.quoteFinalBase;
    const extra = fcl
      ? s.direction === 'EXPORT'
        ? q.quoteExportExtraContainer
        : q.quoteImportExtraContainer
      : ZERO;
    return {
      base,
      extra,
      containers,
      amount: new Prisma.Decimal(base).plus(
        new Prisma.Decimal(extra).times(containers - 1),
      ),
    };
  }

  /** What the printed header needs, in the order of the current invoices. */
  private header(s: HeaderShipment) {
    const count = (t: string) =>
      s.containers.filter((c) => c.type === t).length;
    return {
      id: s.id,
      fileNo: s.fileNo,
      direction: s.direction,
      mode: s.mode,
      client: { id: s.client.id, name: s.client.name },
      hblNumber: s.hblNumber ?? s.mblNumber,
      mblNumber: s.mblNumber,
      pod: s.dischargePort?.name ?? s.freeZone?.name ?? null,
      pol: s.loadingPort?.name ?? null,
      containerNumbers: s.containers.map((c) => c.containerNo).filter(Boolean),
      containers: {
        HQ40: count('HQ40'),
        HQ20: count('HQ20'),
        LCL: count('LCL'),
      },
      vessel: s.vesselName,
      commodity: s.commodity,
      consignee: s.consignee,
      certificateNo: s.certificateNo,
      releaseDate: s.releaseDate,
      weight: s.totalWeight,
    };
  }

  /** IMP / EXP + certificate / year (file number without a certificate), + -USD; kept on a reissue. */
  private async statementNo(
    tx: Tx,
    s: HeaderShipment,
    currency: Currency,
    date: Date,
  ) {
    const previous = await tx.invoice.findFirst({
      where: { shipmentId: s.id, type: 'STATEMENT', currency },
      orderBy: { id: 'desc' },
    });
    if (previous) return previous.invoiceNo;
    const base = s.certificateNo
      ? `${s.direction === 'IMPORT' ? 'IMP' : 'EXP'}${s.certificateNo}/${date.getUTCFullYear()}`
      : s.fileNo;
    return currency === 'USD' ? `${base}-USD` : base;
  }

  /** HL0001 … HL9999, then from HL0001 again with the next cycle; kept on a reissue. */
  private async clearanceNo(tx: Tx, shipmentId: number) {
    const previous = await tx.invoice.findFirst({
      where: { shipmentId, type: 'CLEARANCE' },
      orderBy: { id: 'desc' },
    });
    if (previous)
      return { invoiceNo: previous.invoiceNo, cycle: previous.cycle };
    const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "sequences" ("key", "value") VALUES ('clearance_no', 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = "sequences"."value" + 1
      RETURNING "value"`;
    return {
      invoiceNo: `HL${String(((value - 1) % 9999) + 1).padStart(4, '0')}`,
      cycle: Math.floor((value - 1) / 9999) + 1,
    };
  }

  private async lockAccount(
    tx: Tx,
    shipmentId: number,
  ): Promise<ShipmentAccount> {
    const exists = await tx.shipment.count({ where: { id: shipmentId } });
    if (!exists) throw new NotFoundException('الشحنة غير موجودة');
    await tx.shipmentAccount.upsert({
      where: { shipmentId },
      update: {},
      create: { shipmentId },
    });
    await tx.$queryRaw`SELECT 1 FROM "shipment_accounts" WHERE "shipment_id" = ${shipmentId} FOR UPDATE`;
    return tx.shipmentAccount.findUniqueOrThrow({ where: { shipmentId } });
  }

  private checkVersion(account: ShipmentAccount, version: number) {
    if (account.version !== version) {
      throw new ConflictException(
        'حساب الشحنة اتعدل من شخص تاني بعد ما فتحته، حدّث الصفحة وحاول تاني',
      );
    }
  }

  private async assertOpen(tx: Tx, shipmentId: number) {
    const account = await tx.shipmentAccount.findUnique({
      where: { shipmentId },
    });
    if (account?.status === 'FINISHED') {
      throw new BadRequestException(
        'حساب الشحنة منتهي، افتحه الأول علشان تعدّل الكشف',
      );
    }
  }
}
