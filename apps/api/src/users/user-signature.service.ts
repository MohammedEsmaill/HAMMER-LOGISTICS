import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/** Letters (Arabic or Latin), spaces and a dot: what a signature name holds. */
const NAME = /^[\p{L}][\p{L}\p{M} .]{1,39}$/u;

/**
 * A user's signature: their name written in Ruqaa on the invoices they issue, review
 * or approve. The CEO and the moderator set it; unset, the employee's name is used.
 */
@Injectable()
export class UserSignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async set(actor: AuthUser, id: number, name: string | null) {
    const clean = name?.trim().replace(/\s+/g, ' ') || null;
    if (clean !== null && !NAME.test(clean)) {
      throw new BadRequestException(
        'اسم التوقيع حروف ومسافات بس، من حرفين لـ 40 حرف',
      );
    }
    const before = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, signatureName: true },
    });
    if (!before) throw new NotFoundException('المستخدم غير موجود');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { signatureName: clean } });
      await this.audit.log(
        {
          userId: actor.id,
          action: clean ? 'SET_SIGNATURE' : 'REMOVE_SIGNATURE',
          entity: 'user',
          entityId: id,
          before: { signatureName: before.signatureName },
          after: { signatureName: clean },
        },
        tx,
      );
    });
    return { signatureName: clean };
  }
}
