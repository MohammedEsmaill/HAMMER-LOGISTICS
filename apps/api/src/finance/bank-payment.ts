import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BankPaymentMethod,
  MoneyAccount,
  MovementSource,
  Prisma,
} from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { AuthUser } from '../auth/auth-user';
import { Permission } from '../auth/permissions';
import { can } from '../auth/auth-user';
import { Money } from '../common/validation';
import { Tx } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { decimal } from './money';

const ZERO = new Prisma.Decimal(0);

/** The fields a payment out of a bank account adds: how it was paid and the bank's charges. */
export class BankPaymentDto {
  /** Required when paying from a bank account; none for a cash box. */
  @IsOptional()
  @IsEnum(BankPaymentMethod)
  paymentMethod?: BankPaymentMethod;

  /** The bank's charges on this payment, taken from the same account. */
  @IsOptional()
  @Money()
  bankCharges?: number;
}

export interface BankPayment {
  paymentMethod: BankPaymentMethod | null;
  bankCharges: Prisma.Decimal;
  /** The transfer reference or cheque number (upper case), or null for cash. */
  reference: string | null;
}

/**
 * How a payment left its account. From a cash box: no method, reference or charges.
 * From a bank: transfer or cheque, with its reference (required), and the charges.
 */
export function bankPayment(
  account: Pick<MoneyAccount, 'type'>,
  input: {
    paymentMethod?: BankPaymentMethod | null;
    bankCharges?: number | Prisma.Decimal | null;
    reference?: string | null;
  },
): BankPayment {
  const charges =
    input.bankCharges === undefined || input.bankCharges === null
      ? ZERO
      : new Prisma.Decimal(input.bankCharges);
  if (account.type === 'CASH') {
    if (input.paymentMethod || charges.greaterThan(0) || input.reference) {
      throw new BadRequestException(
        'طريقة الدفع والرقم المرجعي ومصاريف البنك للصرف من البنك بس',
      );
    }
    return { paymentMethod: null, bankCharges: ZERO, reference: null };
  }
  if (!input.paymentMethod) {
    throw new BadRequestException(
      'اختار طريقة الدفع من البنك: تحويل بنكي ولا شيك',
    );
  }
  // a transfer carries the bank's charges; a cheque none
  if (input.paymentMethod === 'CHEQUE' && charges.greaterThan(0)) {
    throw new BadRequestException('الشيك مالوش مصاريف بنكية، المصاريف على التحويل بس');
  }
  if (!input.reference) {
    throw new BadRequestException(
      input.paymentMethod === 'CHEQUE'
        ? 'اكتب رقم الشيك'
        : 'اكتب الرقم المرجعي للتحويل',
    );
  }
  return {
    paymentMethod: input.paymentMethod,
    bankCharges: decimal(charges.toNumber()),
    reference: input.reference.toUpperCase(),
  };
}

/** Posts the bank's charges of a payment as its own line on the same account. */
export async function postBankCharges(
  ledger: LedgerService,
  tx: Tx,
  line: {
    accountId: number;
    charges: Prisma.Decimal;
    date: Date;
    source: MovementSource;
    documentId: number;
    actorId: number;
  },
) {
  if (!line.charges.greaterThan(0)) return;
  await ledger.post(tx, {
    accountId: line.accountId,
    direction: 'OUT',
    amount: line.charges,
    date: line.date,
    source: line.source,
    documentId: line.documentId,
    actorId: line.actorId,
  });
}

/**
 * Cash is the treasury manager's, the bank the accountant's (and the treasury
 * manager's after him): who holds only finance.bank.record may record on a bank
 * account, never on a cash box.
 */
export function assertMayRecordOn(
  actor: AuthUser,
  account: Pick<MoneyAccount, 'type'>,
  cashPermission: Permission,
) {
  if (can(actor, cashPermission)) return;
  if (account.type === 'BANK' && can(actor, 'finance.bank.record')) return;
  throw new ForbiddenException(
    account.type === 'CASH'
      ? 'الحركات النقدية بيسجّلها مدير الخزنة'
      : 'ليس لديك صلاحية تسجيل الحركة دي',
  );
}

/**
 * A salary or an advance: from the cash box, or from a bank by transfer only (no
 * cheques, no charges), with the transfer's reference.
 */
export function transferPayment(
  account: Pick<MoneyAccount, 'type'>,
  input: { paymentMethod?: BankPaymentMethod | null; reference?: string | null },
): { paymentMethod: BankPaymentMethod | null; reference: string | null } {
  if (account.type === 'CASH') {
    if (input.paymentMethod || input.reference) {
      throw new BadRequestException('طريقة الدفع والرقم المرجعي للصرف من البنك بس');
    }
    return { paymentMethod: null, reference: null };
  }
  if (input.paymentMethod && input.paymentMethod !== 'TRANSFER') {
    throw new BadRequestException('الصرف من البنك هنا بالتحويل بس');
  }
  if (!input.reference) throw new BadRequestException('اكتب الرقم المرجعي للتحويل');
  return { paymentMethod: 'TRANSFER', reference: input.reference };
}
