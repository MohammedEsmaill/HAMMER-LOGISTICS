import { InternalServerErrorException } from '@nestjs/common';
import { Tx } from '../prisma/prisma.service';

/** Custody numbers CU26-0001 … CU26-9999; the counter starts again each (Cairo) year. */
export async function nextCustodyNo(tx: Tx, now = new Date()): Promise<string> {
  const yy = new Intl.DateTimeFormat('en', {
    year: '2-digit',
    timeZone: 'Africa/Cairo',
  }).format(now);
  const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "sequences" ("key", "value") VALUES (${`custody_no:${yy}`}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "sequences"."value" + 1
    RETURNING "value"`;
  if (value > 9999) {
    throw new InternalServerErrorException('وصلنا لآخر رقم عهدة متاح للسنة دي');
  }
  return `CU${yy}-${String(value).padStart(4, '0')}`;
}
