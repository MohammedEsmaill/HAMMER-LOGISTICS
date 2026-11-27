import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { AssetTransaction, FixedAsset, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import { assertMayRecordOn, bankPayment, postBankCharges } from './bank-payment';
import { assertDayEditable, openDate } from './days';
import { claimDocument } from './document-version';
import {
  AssetsQueryDto,
  DisposeAssetDto,
  ExistingAssetDto,
  PurchaseAssetDto,
  UpdateAssetDto,
  UpdateAssetTxDto,
} from './dto/asset.dto';
import { LedgerService } from './ledger.service';
import { decimal, todayCairo } from './money';
import { egpPayingAccount } from './paying-account';

/** Below this a device is an expense, not a fixed asset. */
export const MIN_ASSET_COST = 2000;
export const DEFAULT_LIFE_MONTHS = 60;

const ZERO = new Prisma.Decimal(0);
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Straight-line depreciation, as the books compute it (gl_lines_v): a share at each
 * month end from the month acquired, the last share taking the rounding, none after
 * the asset left. Figures at the given day.
 */
export function depreciation(a: Pick<FixedAsset, 'cost' | 'usefulLifeMonths' | 'acquiredOn' | 'disposedOn'>, at: Date) {
  const cost = new Prisma.Decimal(a.cost);
  const share = cost.div(a.usefulLifeMonths).toDecimalPlaces(2);
  const last = cost.minus(share.times(a.usefulLifeMonths - 1));
  const until = a.disposedOn && a.disposedOn < at ? a.disposedOn : at;
  let months = 0;
  for (let n = 1; n <= a.usefulLifeMonths; n++) {
    const end = new Date(Date.UTC(a.acquiredOn.getUTCFullYear(), a.acquiredOn.getUTCMonth() + n, 0));
    if (end > until) break;
    months = n;
  }
  const accumulated = months === 0 ? ZERO : months === a.usefulLifeMonths ? cost : share.times(months);
  const lastEnd = new Date(Date.UTC(a.acquiredOn.getUTCFullYear(), a.acquiredOn.getUTCMonth() + a.usefulLifeMonths, 0));
  return {
    monthly: share.toFixed(2),
    lastShare: last.toFixed(2),
    monthsDone: months,
    monthsLeft: a.usefulLifeMonths - months,
    accumulated: accumulated.toFixed(2),
    netBookValue: cost.minus(accumulated).toFixed(2),
    /** the month end of its last share */
    fullyDepreciatedOn: day(lastEnd),
  };
}

const INCLUDE = {
  custodian: { select: { id: true, fullName: true, code: true } },
  createdBy: { select: { id: true, email: true } },
} as const;

const TX_INCLUDE = {
  asset: { select: { id: true, assetNo: true, name: true, category: true, cost: true } },
  account: { select: { id: true, name: true, type: true, currency: true } },
  createdBy: { select: { id: true, email: true } },
  reviewedBy: { select: { id: true, email: true } },
  managerBy: { select: { id: true, email: true } },
  approvedBy: { select: { id: true, email: true } },
  rejectedBy: { select: { id: true, email: true } },
} as const;

/**
 * The fixed assets: a register of devices (computers, laptops, printers, scanners …),
 * one row each with its serial and who holds it. A purchase, a sale or a scrapping is
 * an asset transaction that goes through the approval cycle; depreciation needs no
 * entry: the books compute it at each month end.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(q: AssetsQueryDto) {
    const where: Prisma.FixedAssetWhereInput = {
      category: q.category,
      status: q.status,
      custodianEmployeeId: q.custodianEmployeeId,
      ...(q.search
        ? {
            OR: [
              { assetNo: { contains: q.search, mode: 'insensitive' } },
              { name: { contains: q.search, mode: 'insensitive' } },
              { model: { contains: q.search, mode: 'insensitive' } },
              { serialNo: { contains: q.search, mode: 'insensitive' } },
              { custodian: { fullName: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const today = todayCairo();
    const all = await this.prisma.fixedAsset.findMany({ where, include: INCLUDE, orderBy: { id: 'desc' } });
    const rows = all.map((a) => ({ ...a, depreciation: depreciation(a, today) }));
    // the totals cover every asset the filters match, the page shows some
    const active = rows.filter((r) => r.status === 'ACTIVE');
    const sum = (f: (r: (typeof rows)[number]) => Prisma.Decimal.Value) => active.reduce((s, r) => s.plus(f(r)), ZERO).toFixed(2);
    const start = (q.page - 1) * q.pageSize;
    return {
      items: rows.slice(start, start + q.pageSize),
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
      totals: {
        count: active.length,
        cost: sum((r) => r.cost),
        accumulated: sum((r) => r.depreciation.accumulated),
        netBookValue: sum((r) => r.depreciation.netBookValue),
      },
    };
  }

  async get(id: number) {
    const a = await this.prisma.fixedAsset.findUnique({
      where: { id },
      include: { ...INCLUDE, transactions: { include: TX_INCLUDE, orderBy: { id: 'asc' } } },
    });
    if (!a) throw new NotFoundException('الأصل غير موجود');
    return { ...a, depreciation: depreciation(a, todayCairo()) };
  }

  async getTx(id: number) {
    const t = await this.prisma.assetTransaction.findUnique({ where: { id }, include: TX_INCLUDE });
    if (!t) throw new NotFoundException('الحركة غير موجودة');
    return t;
  }

  /** A device the company had before the system: its original date and cost. */
  async registerExisting(actor: AuthUser, dto: ExistingAssetDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const cost = this.assetCost(dto.cost);
      if (dto.acquiredOn > todayCairo()) throw new BadRequestException('تاريخ الشراء مينفعش يبقى في المستقبل');
      const asset = await tx.fixedAsset.create({
        data: {
          ...(await this.infoData(tx, dto)),
          assetNo: await this.nextAssetNo(tx),
          acquisition: 'EXISTING',
          acquiredOn: dto.acquiredOn,
          cost,
          createdById: actor.id,
        },
      });
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'fixed_asset', entityId: asset.id, after: asset }, tx);
      return asset.id;
    });
    return this.get(id);
  }

  /** Buying a device: the asset and its purchase together, the money out at once. */
  async purchase(actor: AuthUser, dto: PurchaseAssetDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const cost = this.assetCost(dto.cost);
      const account = await egpPayingAccount(tx, dto.accountId);
      assertMayRecordOn(actor, account, 'assets.transact');
      const bank = bankPayment(account, { paymentMethod: dto.paymentMethod, bankCharges: dto.bankCharges, reference: dto.reference });
      const date = await openDate(tx, dto.purchaseDate, 'تاريخ الشراء');
      const asset = await tx.fixedAsset.create({
        data: {
          ...(await this.infoData(tx, dto)),
          assetNo: await this.nextAssetNo(tx),
          acquisition: 'PURCHASED',
          acquiredOn: date,
          cost,
          createdById: actor.id,
        },
      });
      const t = await tx.assetTransaction.create({
        data: {
          assetId: asset.id,
          kind: 'PURCHASE',
          amount: cost,
          accountId: account.id,
          ...bank,
          party: dto.supplier,
          invoiceNo: dto.invoiceNo,
          txDate: date,
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.post(tx, t, actor.id);
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'fixed_asset', entityId: asset.id, after: asset }, tx);
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'asset_transaction', entityId: t.id, after: t }, tx);
      return asset.id;
    });
    return this.get(id);
  }

  /**
   * The device's data and who holds it, while in use. Its date and cost belong to its
   * purchase when bought here (edited there); a device had before keeps them here.
   */
  async update(actor: AuthUser, id: number, dto: UpdateAssetDto) {
    await this.prisma.$transaction(async (tx) => {
      const count = await tx.fixedAsset.updateMany({ where: { id, version: dto.version }, data: { version: { increment: 1 } } });
      if (count.count !== 1) {
        if (!(await tx.fixedAsset.findUnique({ where: { id } }))) throw new NotFoundException('الأصل غير موجود');
        throw new BadRequestException('الأصل اتعدّل من حد تاني، حدّث الصفحة');
      }
      const before = await tx.fixedAsset.findUniqueOrThrow({ where: { id } });
      if (before.status !== 'ACTIVE') throw new BadRequestException('الأصل خرج (اتباع أو اتكهن)، ومبقاش بيتعدّل');
      if ((dto.cost !== undefined || dto.acquiredOn !== undefined) && before.acquisition !== 'EXISTING')
        throw new BadRequestException('تكلفة وتاريخ الجهاز اللي اتشرى من السيستم بيتعدّلوا من حركة الشراء');
      if (dto.acquiredOn && dto.acquiredOn > todayCairo()) throw new BadRequestException('تاريخ الشراء مينفعش يبقى في المستقبل');
      // its depreciation runs through the months since it entered the books: once one of
      // them is closed, its cost, date and life are the CEO's to change
      const figures = dto.cost !== undefined || dto.acquiredOn !== undefined || dto.usefulLifeMonths !== undefined;
      if (figures && !actor.role.isSystem) {
        const since = before.acquisition === 'EXISTING' ? before.createdAt : before.acquiredOn;
        const closed = await tx.fiscalMonth.findFirst({
          where: { status: 'CLOSED', month: { gte: new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1)) } },
        });
        if (closed)
          throw new BadRequestException('في شهر مقفول من وقت ما الجهاز دخل الدفاتر: التكلفة والتاريخ والعمر بيعدّلهم المدير التنفيذي بس');
      }
      if (dto.custodianEmployeeId) await this.assertEmployee(tx, dto.custodianEmployeeId);
      const after = await tx.fixedAsset.update({
        where: { id },
        data: {
          category: dto.category,
          name: dto.name,
          model: dto.model,
          serialNo: dto.serialNo,
          location: dto.location,
          custodianEmployeeId: dto.custodianEmployeeId,
          usefulLifeMonths: dto.usefulLifeMonths,
          acquiredOn: dto.acquiredOn,
          cost: dto.cost !== undefined ? this.assetCost(dto.cost) : undefined,
          notes: dto.notes,
        },
      });
      await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'fixed_asset', entityId: id, before, after }, tx);
    });
    return this.get(id);
  }

  /** Selling a device (the price into an account) or scrapping it (no money). */
  async dispose(actor: AuthUser, id: number, dto: DisposeAssetDto) {
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findUnique({ where: { id } });
      if (!asset) throw new NotFoundException('الأصل غير موجود');
      if (asset.status !== 'ACTIVE') throw new BadRequestException('الأصل خرج قبل كده');
      const date = await openDate(tx, dto.date, dto.kind === 'SALE' ? 'تاريخ البيع' : 'تاريخ التكهين');
      if (date < asset.acquiredOn) throw new BadRequestException('التاريخ قبل تاريخ شراء الجهاز');
      let money: { accountId: number | null; amount: Prisma.Decimal; bank: ReturnType<typeof bankPayment> | null } = {
        accountId: null,
        amount: ZERO,
        bank: null,
      };
      if (dto.kind === 'SALE') {
        if (!dto.amount || !dto.accountId) throw new BadRequestException('اكتب سعر البيع واختار الخزنة أو الحساب اللي هيدخلها');
        const account = await egpPayingAccount(tx, dto.accountId);
        assertMayRecordOn(actor, account, 'assets.transact');
        money = {
          accountId: account.id,
          amount: decimal(dto.amount),
          bank: bankPayment(account, { paymentMethod: dto.paymentMethod, bankCharges: 0, reference: dto.reference }),
        };
      } else if (dto.amount || dto.accountId) {
        throw new BadRequestException('التكهين مفيهوش فلوس');
      }
      const t = await tx.assetTransaction.create({
        data: {
          assetId: id,
          kind: dto.kind,
          amount: money.amount,
          accountId: money.accountId,
          paymentMethod: money.bank?.paymentMethod ?? null,
          reference: money.bank?.reference ?? null,
          party: dto.kind === 'SALE' ? dto.buyer : null,
          txDate: date,
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      const after = await tx.fixedAsset.update({
        where: { id },
        data: { status: dto.kind === 'SALE' ? 'SOLD' : 'SCRAPPED', disposedOn: date, version: { increment: 1 } },
      });
      await this.post(tx, t, actor.id);
      await this.audit.log({ userId: actor.id, action: dto.kind, entity: 'fixed_asset', entityId: id, before: asset, after }, tx);
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'asset_transaction', entityId: t.id, after: t }, tx);
    });
    return this.get(id);
  }

  /** A purchase or a sale corrected: by its author before approval, the CEO after. */
  async updateTx(actor: AuthUser, id: number, dto: UpdateAssetTxDto) {
    await this.prisma.$transaction(async (tx) => {
      await claimDocument(tx, 'ASSET', id, dto.version);
      const before = await tx.assetTransaction.findUniqueOrThrow({ where: { id }, include: { asset: true } });
      const { resetApproval } = assertCanEdit(actor, before);
      await assertDayEditable(tx, actor, before.txDate);
      if (before.kind === 'SCRAP' && dto.amount !== undefined) throw new BadRequestException('التكهين مفيهوش فلوس');
      const amount =
        dto.amount === undefined ? before.amount : before.kind === 'PURCHASE' ? this.assetCost(dto.amount) : decimal(dto.amount);
      const date = dto.date !== undefined ? await openDate(tx, dto.date, 'التاريخ', actor) : before.txDate;
      if (before.kind !== 'PURCHASE' && date < before.asset.acquiredOn) throw new BadRequestException('التاريخ قبل تاريخ شراء الجهاز');
      const account = before.accountId ? await tx.moneyAccount.findUniqueOrThrow({ where: { id: before.accountId } }) : null;
      const bank = account
        ? bankPayment(account, {
            paymentMethod: dto.paymentMethod !== undefined ? dto.paymentMethod : before.paymentMethod,
            bankCharges: before.kind === 'PURCHASE' ? (dto.bankCharges !== undefined ? dto.bankCharges : before.bankCharges) : 0,
            reference: dto.reference !== undefined ? dto.reference : before.reference,
          })
        : null;
      const moneyChanged =
        !amount.equals(before.amount) ||
        date.getTime() !== before.txDate.getTime() ||
        (bank !== null && !bank.bankCharges.equals(before.bankCharges));
      if (moneyChanged && account) await this.ledger.reverseDocument(tx, 'ASSET', id, actor.id);
      const after = await tx.assetTransaction.update({
        where: { id },
        data: {
          amount,
          txDate: date,
          ...(bank ?? {}),
          party: dto.party,
          invoiceNo: dto.invoiceNo,
          notes: dto.notes,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      // the asset follows its purchase (cost, date) or its way out (date)
      await tx.fixedAsset.update({
        where: { id: before.assetId },
        data:
          before.kind === 'PURCHASE'
            ? { cost: amount, acquiredOn: date, version: { increment: 1 } }
            : { disposedOn: date, version: { increment: 1 } },
      });
      if (moneyChanged && account) await this.post(tx, after, actor.id);
      await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'asset_transaction', entityId: id, before, after }, tx);
    });
    return this.getTx(id);
  }

  // ───── helpers ─────

  private assetCost(value: number) {
    const cost = decimal(value);
    if (cost.lessThan(MIN_ASSET_COST))
      throw new BadRequestException(`أقل من ${MIN_ASSET_COST.toLocaleString('en-US')} ج بيتسجل مصروف عادي مش أصل ثابت`);
    return cost;
  }

  private async infoData(tx: Tx, dto: ExistingAssetDto | PurchaseAssetDto) {
    if (dto.custodianEmployeeId) await this.assertEmployee(tx, dto.custodianEmployeeId);
    return {
      category: dto.category,
      name: dto.name,
      model: dto.model || null,
      serialNo: dto.serialNo || null,
      location: dto.location || null,
      custodianEmployeeId: dto.custodianEmployeeId ?? null,
      usefulLifeMonths: dto.usefulLifeMonths ?? DEFAULT_LIFE_MONTHS,
      notes: dto.notes || null,
    };
  }

  private async assertEmployee(tx: Tx, id: number) {
    const e = await tx.employee.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw new BadRequestException('الموظف غير موجود');
  }

  /** Asset numbers FA26-0001 …; the counter starts again each (Cairo) year. */
  private async nextAssetNo(tx: Tx): Promise<string> {
    const yy = new Intl.DateTimeFormat('en', { year: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date());
    const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "sequences" ("key", "value") VALUES (${`asset_no:${yy}`}, 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = "sequences"."value" + 1
      RETURNING "value"`;
    if (value > 9999) throw new InternalServerErrorException('وصلنا لآخر رقم أصل متاح للسنة دي');
    return `FA${yy}-${String(value).padStart(4, '0')}`;
  }

  /** The money: a purchase out (with the bank's charges), a sale in, a scrapping nothing. */
  private async post(tx: Tx, t: AssetTransaction, actorId: number) {
    if (t.kind === 'SCRAP' || !t.accountId) return;
    const line = { accountId: t.accountId, date: t.txDate, source: 'ASSET' as const, documentId: t.id, actorId };
    if (t.kind === 'PURCHASE') {
      await this.ledger.post(tx, { ...line, direction: 'OUT', amount: t.amount });
      await postBankCharges(this.ledger, tx, { ...line, charges: t.bankCharges });
    } else {
      await this.ledger.post(tx, { ...line, direction: 'IN', amount: t.amount });
    }
  }
}
