import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Tx } from '../prisma/prisma.service';
import { APPROVABLE, ApprovableType } from './approvals/approvable';

/**
 * Optimistic locking for every financial document: bumps the version only if it is
 * still the one the user edited, and locks the row until the transaction ends.
 */
export async function claimDocument(
  tx: Tx,
  type: ApprovableType,
  id: number,
  version: number,
): Promise<void> {
  const table = Prisma.raw(`"${APPROVABLE[type].table}"`);
  const count = await tx.$executeRaw`
    UPDATE ${table} SET "version" = "version" + 1 WHERE "id" = ${id} AND "version" = ${version}`;
  if (count === 1) return;
  const [exists] = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM ${table} WHERE "id" = ${id}`;
  if (!exists)
    throw new NotFoundException(`${APPROVABLE[type].label} غير موجود`);
  throw new ConflictException(
    'الحركة اتعدلت من شخص تاني بعد ما فتحتها، حدّث الصفحة وعدّل تاني',
  );
}
