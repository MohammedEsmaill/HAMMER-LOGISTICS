import { BadRequestException } from '@nestjs/common';
import { MoneyAccount } from '@prisma/client';
import { Tx } from '../prisma/prisma.service';

/**
 * The account an office expense is paid from: active and in EGP; the EGP cash box
 * only when cashOnly (general expenses).
 */
export async function egpPayingAccount(
  tx: Tx,
  id: number,
  { cashOnly = false } = {},
): Promise<MoneyAccount> {
  const account = await tx.moneyAccount.findUnique({ where: { id } });
  if (!account) throw new BadRequestException('الخزنة أو الحساب غير موجود');
  if (!account.isActive) throw new BadRequestException(`${account.name} موقوف`);
  if (account.currency !== 'EGP') {
    throw new BadRequestException(
      'الصرف ده بالجنيه بس: اختار خزنة أو حساب جنيه',
    );
  }
  if (cashOnly && account.type !== 'CASH') {
    throw new BadRequestException('المصاريف العمومية بتتصرف من خزنة الجنيه بس');
  }
  return account;
}

export async function egpCashBox(tx: Tx): Promise<MoneyAccount> {
  const box = await tx.moneyAccount.findFirst({
    where: { type: 'CASH', currency: 'EGP' },
  });
  if (!box) throw new BadRequestException('خزنة الجنيه مش موجودة');
  return box;
}
