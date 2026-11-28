import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BeneficiaryKind, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, can } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import {
  BeneficiariesQueryDto,
  CreateBeneficiaryDto,
  UpdateBeneficiaryDto,
} from './dto/beneficiary.dto';

/** "eg38 0019 0005-..." → "EG380019000 5-..." stored without spaces, upper case. */
const normalise = (n: string) => n.replace(/\s+/g, '').toUpperCase();

const SELECT = {
  id: true,
  name: true,
  kind: true,
  clearer: { select: { id: true, fullName: true } },
  party: { select: { id: true, name: true, kind: true } },
  bankName: true,
  accountNumber: true,
  isActive: true,
  notes: true,
} as const;

/** External bank accounts: shipping agencies, clearers and others the office pays into. */
@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: BeneficiariesQueryDto) {
    const where: Prisma.BeneficiaryWhereInput = {
      kind: q.kind,
      clearerId: q.clearerId,
      partyId: q.partyId,
      isActive: q.activeOnly === false ? undefined : true,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { bankName: { contains: q.search, mode: 'insensitive' } },
              { accountNumber: { contains: normalise(q.search) } },
            ],
          }
        : {}),
    };
    return this.prisma.beneficiary.findMany({
      where,
      select: SELECT,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      take: q.pageSize,
    });
  }

  async create(actor: AuthUser, dto: CreateBeneficiaryDto) {
    return this.prisma.$transaction(async (tx) => {
      assertMayKeep(actor, dto.kind);
      await this.checkClearer(tx, dto.kind, dto.clearerId);
      await this.checkParty(tx, dto.kind, dto.partyId);
      const created = await tx.beneficiary.create({
        data: {
          ...dto,
          clearerId: dto.kind === 'CLEARER' ? dto.clearerId : null,
          partyId: dto.kind === 'PARTY' ? dto.partyId : null,
          accountNumber: normalise(dto.accountNumber),
          createdById: actor.id,
        },
        select: SELECT,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'beneficiary',
          entityId: created.id,
          after: created,
        },
        tx,
      );
      return created;
    });
  }

  async update(actor: AuthUser, id: number, dto: UpdateBeneficiaryDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.beneficiary.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('المستفيد غير موجود');
      assertMayKeep(actor, before.kind);
      const after = await tx.beneficiary.update({
        where: { id },
        data: {
          ...dto,
          accountNumber: dto.accountNumber
            ? normalise(dto.accountNumber)
            : undefined,
        },
        select: SELECT,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'beneficiary',
          entityId: id,
          before,
          after,
        },
        tx,
      );
      return after;
    });
  }

  private async checkParty(tx: Tx, kind: string, partyId?: number) {
    if (kind !== 'PARTY') {
      if (partyId) throw new BadRequestException('الجهة للحساب اللي نوعه حساب داخلي بس');
      return;
    }
    if (!partyId) throw new BadRequestException('اختار الجهة صاحبة الحساب');
    const party = await tx.internalParty.findUnique({ where: { id: partyId } });
    if (!party) throw new BadRequestException('الجهة غير موجودة');
  }

  private async checkClearer(tx: Tx, kind: string, clearerId?: number) {
    if (kind !== 'CLEARER') {
      if (clearerId)
        throw new BadRequestException('المستخلص للحساب اللي نوعه مستخلص بس');
      return;
    }
    if (!clearerId) throw new BadRequestException('اختار المستخلص صاحب الحساب');
    const clearer = await tx.clearer.findFirst({
      where: { id: clearerId, deletedAt: null },
    });
    if (!clearer) throw new BadRequestException('المستخلص غير موجود');
  }
}

/**
 * Who keeps which accounts: a clearer's from the users screen (or with his fees), a
 * sister company's or owner's from the internal accounts, the rest with the payment.
 */
function assertMayKeep(actor: AuthUser, kind: BeneficiaryKind) {
  const ok =
    kind === 'CLEARER'
      ? can(actor, 'users.manage') || can(actor, 'finance.fees.pay')
      : kind === 'PARTY'
        ? can(actor, 'finance.parties.manage')
        : can(actor, 'finance.custody.manage') || can(actor, 'finance.bank.record');
  if (!ok)
    throw new ForbiddenException(
      kind === 'CLEARER'
        ? 'حسابات المستخلص بتتضاف من «المستخدمين»'
        : kind === 'PARTY'
          ? 'حسابات الجهات بتتضاف من «الحسابات الداخلية»'
          : 'ليس لديك صلاحية لهذا الإجراء',
    );
}

/** An active external account to pay into; for a clearer, it must be theirs. */
export async function payableBeneficiary(
  tx: Tx,
  id: number,
  clearerId?: number,
) {
  const b = await tx.beneficiary.findUnique({ where: { id } });
  if (!b) throw new BadRequestException('المستفيد غير موجود');
  if (!b.isActive) throw new BadRequestException(`حساب ${b.name} موقوف`);
  if (clearerId !== undefined && b.clearerId !== clearerId) {
    throw new BadRequestException('التحويل لازم يكون لحساب المستخلص نفسه');
  }
  return b;
}
