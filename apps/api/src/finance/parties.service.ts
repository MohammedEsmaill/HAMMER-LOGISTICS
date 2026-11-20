import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  MoneyDirection,
  PartyMovementKind,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import { claimDocument } from './document-version';
import { assertDayEditable, openDate } from './days';
import {
  CreatePartyDto,
  CreatePartyMovementDto,
  PartyStatementQueryDto,
  UpdatePartyDto,
  UpdatePartyMovementDto,
} from './dto/party.dto';
import { LedgerService } from './ledger.service';
import { decimal } from './money';
import { DOCUMENT_INCLUDE } from './transfers.service';

const ZERO = new Prisma.Decimal(0);

/** Funding brings money in; a payment or a shared debt takes it out. */
const DIRECTION: Record<PartyMovementKind, MoneyDirection> = {
  FUNDING: 'IN',
  PAYMENT: 'OUT',
  SHARED_DEBT: 'OUT',
};

const ACCOUNT = {
  select: {
    id: true,
    name: true,
    type: true,
    currency: true,
    ownership: true,
  },
} as const;

/** What a party owes per currency: money out to them minus money in from them. */
export interface PartyBalance {
  currency: Currency;
  /** Positive: they owe us (مدين). Negative: we owe them (دائن). */
  balance: string;
  in: string;
  out: string;
}

/**
 * The internal accounts: sister companies and owners. Each movement posts one ledger
 * line on a cash box or a bank account at once, and goes through the approval cycle.
 * A party's balance counts every movement, since the money already moved.
 */
@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /** Every party with its balance per currency, and the owners' personal accounts. */
  async list() {
    const [parties, sums] = await Promise.all([
      this.prisma.internalParty.findMany({
        orderBy: [{ isActive: 'desc' }, { kind: 'asc' }, { name: 'asc' }],
        include: {
          personalAccounts: {
            select: { id: true, name: true, bankName: true, currency: true },
          },
          _count: { select: { movements: true } },
        },
      }),
      this.prisma.partyMovement.groupBy({
        by: ['partyId', 'currency', 'direction'],
        orderBy: [{ partyId: 'asc' }],
        _sum: { amount: true },
      }),
    ]);
    return parties.map((p) => ({
      ...p,
      balances: this.balances(sums.filter((s) => s.partyId === p.id)),
    }));
  }

  /** Active parties only, for the movement form. */
  options() {
    return this.prisma.internalParty.findMany({
      where: { isActive: true },
      select: { id: true, name: true, kind: true },
      orderBy: { name: 'asc' },
    });
  }

  async createParty(actor: AuthUser, dto: CreatePartyDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertNameFree(tx, dto.name);
      const party = await tx.internalParty.create({ data: dto });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'internal_party',
          entityId: party.id,
          after: party,
        },
        tx,
      );
      return party;
    });
  }

  async updateParty(actor: AuthUser, id: number, dto: UpdatePartyDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.internalParty.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('الجهة غير موجودة');
      if (dto.name !== undefined && dto.name !== before.name)
        await this.assertNameFree(tx, dto.name);
      const after = await tx.internalParty.update({
        where: { id },
        data: { name: dto.name, notes: dto.notes, isActive: dto.isActive },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'internal_party',
          entityId: id,
          before,
          after,
        },
        tx,
      );
      return after;
    });
  }

  /**
   * A party's statement: the balance per currency before the period, then each
   * movement with the running balance of its currency.
   */
  async statement(id: number, q: PartyStatementQueryDto) {
    const party = await this.prisma.internalParty.findUnique({
      where: { id },
    });
    if (!party) throw new NotFoundException('الجهة غير موجودة');
    const [before, rows] = await Promise.all([
      q.from
        ? this.prisma.partyMovement.groupBy({
            by: ['partyId', 'currency', 'direction'],
            where: { partyId: id, movementDate: { lt: q.from } },
            orderBy: [{ partyId: 'asc' }],
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      this.prisma.partyMovement.findMany({
        where: { partyId: id, movementDate: { gte: q.from, lte: q.to } },
        include: { account: ACCOUNT, createdBy: DOCUMENT_INCLUDE.createdBy },
        orderBy: [{ movementDate: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const opening = this.balances(before);
    const running = new Map<Currency, Prisma.Decimal>(
      opening.map((b) => [b.currency, new Prisma.Decimal(b.balance)]),
    );
    const lines = rows.map((m) => {
      const delta = m.direction === 'OUT' ? m.amount : m.amount.negated();
      const balance = (running.get(m.currency) ?? ZERO).plus(delta);
      running.set(m.currency, balance);
      return { ...m, balance: balance.toFixed(2) };
    });
    const sums = await this.prisma.partyMovement.groupBy({
      by: ['partyId', 'currency', 'direction'],
      where: { partyId: id, movementDate: { lte: q.to } },
      orderBy: [{ partyId: 'asc' }],
      _sum: { amount: true },
    });
    return { party, opening, lines, closing: this.balances(sums) };
  }

  async get(id: number) {
    const movement = await this.prisma.partyMovement.findUnique({
      where: { id },
      include: {
        party: { select: { id: true, name: true, kind: true } },
        account: ACCOUNT,
        ...DOCUMENT_INCLUDE,
      },
    });
    if (!movement) throw new NotFoundException('الحركة غير موجودة');
    return movement;
  }

  async create(actor: AuthUser, dto: CreatePartyMovementDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const party = await tx.internalParty.findUnique({
        where: { id: dto.partyId },
      });
      if (!party || !party.isActive) {
        throw new BadRequestException('الجهة غير موجودة أو موقوفة');
      }
      const payee = this.payeeFor(dto.kind, dto.payee);
      const account = await this.account(tx, dto.accountId);
      const direction = DIRECTION[dto.kind];
      const movement = await tx.partyMovement.create({
        data: {
          partyId: party.id,
          accountId: account.id,
          currency: account.currency,
          kind: dto.kind,
          direction,
          amount: decimal(dto.amount),
          movementDate: await openDate(tx, dto.movementDate, 'تاريخ الحركة'),
          payee,
          reference: dto.reference,
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.ledger.post(tx, {
        accountId: account.id,
        direction,
        amount: movement.amount,
        date: movement.movementDate,
        source: 'PARTY',
        documentId: movement.id,
        actorId: actor.id,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'party_movement',
          entityId: movement.id,
          after: movement,
        },
        tx,
      );
      return movement.id;
    });
    return this.get(id);
  }

  async update(actor: AuthUser, id: number, dto: UpdatePartyMovementDto) {
    await this.prisma.$transaction(async (tx) => {
      // the version claim locks the row first, so what is read below cannot change under us
      await claimDocument(tx, 'PARTY', id, dto.version);
      const before = await tx.partyMovement.findUniqueOrThrow({
        where: { id },
      });
      const { resetApproval } = assertCanEdit(actor, before);
      await assertDayEditable(tx, actor, before.movementDate);

      const account =
        dto.accountId !== undefined && dto.accountId !== before.accountId
          ? await this.account(tx, dto.accountId)
          : null;
      if (account && account.currency !== before.currency) {
        throw new BadRequestException(
          'الحساب الجديد لازم يبقى بنفس عملة الحركة',
        );
      }
      const accountId = account?.id ?? before.accountId;
      const amount =
        dto.amount !== undefined ? decimal(dto.amount) : before.amount;
      const movementDate =
        dto.movementDate !== undefined
          ? await openDate(tx, dto.movementDate, 'تاريخ الحركة', actor)
          : before.movementDate;
      const payee =
        dto.payee !== undefined
          ? this.payeeFor(before.kind, dto.payee)
          : before.payee;
      const moneyChanged =
        accountId !== before.accountId ||
        !amount.equals(before.amount) ||
        movementDate.getTime() !== before.movementDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'PARTY', id, actor.id);
      const after = await tx.partyMovement.update({
        where: { id },
        data: {
          accountId,
          amount,
          movementDate,
          payee,
          reference: dto.reference,
          notes: dto.notes,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged) {
        await this.ledger.post(tx, {
          accountId,
          direction: after.direction,
          amount,
          date: movementDate,
          source: 'PARTY',
          documentId: id,
          actorId: actor.id,
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'party_movement',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.get(id);
  }

  private balances(
    sums: {
      currency: Currency;
      direction: MoneyDirection;
      _sum: { amount: Prisma.Decimal | null };
    }[],
  ): PartyBalance[] {
    const currencies = [...new Set(sums.map((s) => s.currency))].sort();
    return currencies.map((currency) => {
      const total = (d: MoneyDirection) =>
        sums.find((s) => s.currency === currency && s.direction === d)?._sum
          .amount ?? ZERO;
      return {
        currency,
        balance: total('OUT').minus(total('IN')).toFixed(2),
        in: total('IN').toFixed(2),
        out: total('OUT').toFixed(2),
      };
    });
  }

  private payeeFor(kind: PartyMovementKind, payee?: string | null) {
    if (kind !== 'SHARED_DEBT') return null;
    if (!payee) throw new BadRequestException('اكتب اتدفع لمين');
    return payee;
  }

  private async account(tx: Tx, id: number) {
    const account = await tx.moneyAccount.findUnique({ where: { id } });
    if (!account) throw new BadRequestException('الخزنة أو الحساب غير موجود');
    return account;
  }

  private async assertNameFree(tx: Tx, name: string) {
    const taken = await tx.internalParty.count({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (taken) throw new ConflictException('فيه جهة بنفس الاسم');
  }
}
