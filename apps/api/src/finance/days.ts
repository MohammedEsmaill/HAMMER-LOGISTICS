import { BadRequestException } from '@nestjs/common';
import { AuthUser, can } from '../auth/auth-user';
import { Tx } from '../prisma/prisma.service';
import { businessDate, todayCairo } from './money';

const dayText = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Whether money may be recorded on a day. Today is always open; a past day is closed
 * (it closed by itself after midnight, Cairo) unless the CEO reopened it, until the
 * end of the day it was reopened on.
 */
export async function isDayOpen(tx: Tx, day: Date): Promise<boolean> {
  const today = todayCairo();
  if (day >= today) return true;
  const row = await tx.journalDay.findUnique({ where: { date: day } });
  return (
    row?.status === 'OPEN' && !!row.reopenedUntil && row.reopenedUntil >= today
  );
}

/** The CEO edits operations of a closed day; nobody else does. */
const mayEditClosed = (actor?: AuthUser) =>
  !!actor && can(actor, 'finance.approved.edit');

/**
 * A business date for a new operation, or a changed date on an edit: never in the
 * future, and on an open day (the CEO's edits excepted).
 */
export async function openDate(
  tx: Tx,
  value: Date | undefined,
  label: string,
  editor?: AuthUser,
): Promise<Date> {
  const day = businessDate(value, label);
  if (!(await isDayOpen(tx, day)) && !mayEditClosed(editor)) {
    throw new BadRequestException(
      `يومية ${dayText(day)} اتقفلت، ومينفعش تتسجل عليها معاملات. سجّلها بتاريخ النهاردة، أو اطلب من المدير التنفيذي يفتح اليوم`,
    );
  }
  return day;
}

/** Editing an operation of a closed day: the CEO only. */
export async function assertDayEditable(
  tx: Tx,
  actor: AuthUser,
  ...days: (Date | null | undefined)[]
) {
  if (mayEditClosed(actor)) return;
  for (const day of days) {
    if (day && !(await isDayOpen(tx, day))) {
      throw new BadRequestException(
        `المعاملة دي على يومية ${dayText(day)} اللي اتقفلت، وتعديلها للمدير التنفيذي بس`,
      );
    }
  }
}
