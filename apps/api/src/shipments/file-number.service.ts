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
    const yy = new Intl.DateTimeFormat('en', {
      year: '2-digit',
      timeZone: 'Africa/Cairo',
    }).format(now);
    const [{ value }] = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "sequences" ("key", "value") VALUES (${`file_no:${yy}`}, 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = "sequences"."value" + 1
      RETURNING "value"`;
    if (value > MAX_PER_YEAR) {
      throw new InternalServerErrorException(
        'وصلنا لآخر رقم ملف متاح للسنة دي (9999)',
      );
    }
    return `HL${yy}-${String(value).padStart(4, '0')}`;
  }
}
