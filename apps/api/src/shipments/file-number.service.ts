import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Tx } from '../prisma/prisma.service';

const MAX_PER_YEAR = 9999;

/** File numbers HL26-0001 … HL26-9999; the counter starts again each (Cairo) year. */
@Injectable()
export class FileNumberService {
  /**
   * Must run inside the registration transaction: the counter row stays locked
   * until commit, and a rollback gives the number back.
   */
  async next(tx: Tx, now = new Date()): Promise<string> {
    const yy = this.year(now);
    const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "sequences" ("key", "value") VALUES (${`file_no:${yy}`}, 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = "sequences"."value" + 1
      RETURNING "value"`;
    if (value > MAX_PER_YEAR) {
      throw new InternalServerErrorException(
        'وصلنا لآخر رقم ملف متاح للسنة دي (9999)',
      );
    }
    return this.format(yy, value);
  }

  /**
   * The number the next registration would get, without taking it: shown on the
   * form for information only, since someone else may register first.
   */
  async peek(db: Tx, now = new Date()): Promise<string | null> {
    const yy = this.year(now);
    const [row] = await db.$queryRaw<{ value: number }[]>`
      SELECT "value" FROM "sequences" WHERE "key" = ${`file_no:${yy}`}`;
    const value = (row?.value ?? 0) + 1;
    return value > MAX_PER_YEAR ? null : this.format(yy, value);
  }

  private year(now: Date) {
    return new Intl.DateTimeFormat('en', {
      year: '2-digit',
      timeZone: 'Africa/Cairo',
    }).format(now);
  }

  private format(yy: string, value: number) {
    return `HL${yy}-${String(value).padStart(4, '0')}`;
  }
}
