import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/** The largest signature image kept (the screen shrinks it before upload). */
const MAX_BYTES = 60 * 1024;
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** What each image kind starts with, so a renamed file is refused. */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  png: (b) =>
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) =>
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP',
};

/**
 * A user's signature, printed on the invoices they issue, review or approve. The CEO
 * and the moderator set it; the image itself stays out of the audit log.
 */
@Injectable()
export class UserSignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { signature: true, signatureAt: true },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return { image: user.signature, updatedAt: user.signatureAt };
  }

  async set(actor: AuthUser, id: number, image: string | null) {
    if (image !== null) this.check(image);
    const before = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, signatureAt: true },
    });
    if (!before) throw new NotFoundException('المستخدم غير موجود');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { signature: image, signatureAt: image ? new Date() : null },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: image ? 'SET_SIGNATURE' : 'REMOVE_SIGNATURE',
          entity: 'user',
          entityId: id,
          before: { hasSignature: !!before.signatureAt },
          after: { hasSignature: !!image },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private check(image: string) {
    const match = DATA_URL.exec(image);
    if (!match) {
      throw new BadRequestException('التوقيع لازم يكون صورة PNG أو JPG');
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_BYTES) {
      throw new BadRequestException('صورة التوقيع كبيرة: 60 كيلوبايت بالكتير');
    }
    if (!MAGIC[match[1]](bytes)) {
      throw new BadRequestException('الملف مش صورة سليمة');
    }
  }
}
