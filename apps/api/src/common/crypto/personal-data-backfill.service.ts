import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { blindIndex, encrypt, isEncrypted } from './personal-data';

/**
 * At start: the employees and clearers still kept in plain text (from before) get their
 * national ID and phone encrypted, with their hashes. Two people with the same number
 * cannot both be kept unique: the second stays as it was and is named in the log.
 */
@Injectable()
export class PersonalDataBackfill implements OnApplicationBootstrap {
  private readonly logger = new Logger(PersonalDataBackfill.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    await this.run().catch((e: unknown) => this.logger.error(`Encrypting the old rows stopped: ${String(e)}`));
  }

  async run(): Promise<number> {
    let done = 0;
    const plain = { OR: [{ nationalIdHash: null }, { phoneHash: null }] };
    for (const e of await this.prisma.employee.findMany({ where: plain, select: { id: true, fullName: true, nationalId: true, phone: true } })) {
      done += await this.seal(e, (data) => this.prisma.employee.update({ where: { id: e.id }, data }), 'employee');
    }
    for (const c of await this.prisma.clearer.findMany({ where: plain, select: { id: true, fullName: true, nationalId: true, phone: true } })) {
      done += await this.seal(c, (data) => this.prisma.clearer.update({ where: { id: c.id }, data }), 'clearer');
    }
    if (done) this.logger.log(`Encrypted the national ID and phone of ${done} people`);
    return done;
  }

  private async seal(
    row: { id: number; fullName: string; nationalId: string; phone: string },
    save: (data: object) => Promise<unknown>,
    kind: string,
  ): Promise<number> {
    // a row already encrypted but missing a hash cannot be fixed here
    if (isEncrypted(row.nationalId) || isEncrypted(row.phone)) return 0;
    try {
      await save({
        nationalId: encrypt(row.nationalId),
        nationalIdHash: blindIndex(row.nationalId),
        phone: encrypt(row.phone),
        phoneHash: blindIndex(row.phone),
      });
      return 1;
    } catch {
      this.logger.warn(`${kind} ${row.id} (${row.fullName}): the same national ID or phone as someone else; fix it from the screen`);
      return 0;
    }
  }
}
