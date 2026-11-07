import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MoneyDirection,
  MoneyMovement,
  MovementSource,
  Prisma,
} from '@prisma/client';
import { Tx } from '../prisma/prisma.service';
import { formatAmount } from './money';

export interface PostLine {
  accountId: number;
  direction: MoneyDirection;
  amount: Prisma.Decimal;
  date: Date;
  source: MovementSource;
  /** The document's id, written to the FK column of its source. */
  documentId: number;
  actorId: number;
  reversalOfId?: bigint;
}

const SOURCE_COLUMN: Record<
  MovementSource,
  | 'transferId'
  | 'otherMovementId'
  | 'salaryId'
  | 'advanceId'
  | 'expenseId'
  | 'custodyId'
  | 'feePaymentId'
  | 'collectionId'
> = {
  TRANSFER: 'transferId',
  OTHER: 'otherMovementId',
  SALARY: 'salaryId',
  ADVANCE: 'advanceId',
  EXPENSE: 'expenseId',
  CUSTODY: 'custodyId',
  FEE_PAYMENT: 'feePaymentId',
  COLLECTION: 'collectionId',
};

interface LockedAccount {
  id: number;
  name: string;
  currency: string;
  balance: Prisma.Decimal;
  is_active: boolean;
}

/**
 * The only way money moves: each line locks its account, refuses a balance below
 * zero with the amount available, updates the balance and appends one ledger line.
 * Lines are never changed; a correction appends a reversal.
 */
@Injectable()
export class LedgerService {
  /**
   * Locks the accounts a document touches, in id order (no deadlocks between two
   * documents locking the same pair). Call before posting lines on several accounts.
   */
  async lock(
    tx: Tx,
    accountIds: number[],
  ): Promise<Map<number, LockedAccount>> {
    const ids = [...new Set(accountIds)].sort((a, b) => a - b);
    const rows = await tx.$queryRaw<LockedAccount[]>`
      SELECT "id", "name", "currency"::text AS "currency", "balance", "is_active"
        FROM "money_accounts" WHERE "id" IN (${Prisma.join(ids)})
       ORDER BY "id" FOR UPDATE`;
    return new Map(rows.map((r) => [r.id, r]));
  }

  async post(tx: Tx, line: PostLine): Promise<MoneyMovement> {
    const [account] = (await this.lock(tx, [line.accountId])).values();
    if (!account) throw new BadRequestException('الخزنة أو الحساب غير موجود');
    if (!account.is_active && !line.reversalOfId) {
      throw new BadRequestException(`${account.name} موقوف`);
    }
    const delta = line.direction === 'IN' ? line.amount : line.amount.negated();
    const balance = new Prisma.Decimal(account.balance).plus(delta);
    if (balance.isNegative()) {
      throw new BadRequestException(
        `رصيد ${account.name} مش كفاية: المتاح ${formatAmount(account.balance)} ${account.currency} والمطلوب ${formatAmount(line.amount)}`,
      );
    }
    await tx.moneyAccount.update({
      where: { id: account.id },
      data: { balance },
    });
    return tx.moneyMovement.create({
      data: {
        accountId: account.id,
        direction: line.direction,
        amount: line.amount,
        balanceAfter: balance,
        movementDate: line.date,
        source: line.source,
        [SOURCE_COLUMN[line.source]]: line.documentId,
        reversalOfId: line.reversalOfId,
        createdById: line.actorId,
      },
    });
  }

  /**
   * Reverses every live line of a document (lines not reversed and not reversals),
   * e.g. before posting its corrected lines. Returns how many were reversed.
   */
  async reverseDocument(
    tx: Tx,
    source: MovementSource,
    documentId: number,
    actorId: number,
  ): Promise<number> {
    const lines = await tx.moneyMovement.findMany({
      where: {
        [SOURCE_COLUMN[source]]: documentId,
        reversalOfId: null,
        reversedBy: null,
      },
      orderBy: { id: 'asc' },
    });
    await this.lock(
      tx,
      lines.map((l) => l.accountId),
    );
    // money that came in goes out first, so a reversal never borrows from itself
    const ordered = [...lines].sort((a, b) =>
      a.direction === b.direction ? 0 : a.direction === 'IN' ? -1 : 1,
    );
    for (const l of ordered) {
      await this.post(tx, {
        accountId: l.accountId,
        direction: l.direction === 'IN' ? 'OUT' : 'IN',
        amount: l.amount,
        date: l.movementDate,
        source,
        documentId,
        actorId,
        reversalOfId: l.id,
      });
    }
    return lines.length;
  }
}
