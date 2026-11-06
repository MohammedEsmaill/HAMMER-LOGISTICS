import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PasswordService } from '../auth/password.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const LIST_SELECT = {
  id: true,
  email: true,
  accountType: true,
  isActive: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  role: { select: { id: true, name: true, isSystem: true } },
  employee: { select: { id: true, fullName: true, department: true } },
  clearer: { select: { id: true, fullName: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      select: LIST_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  /** Active employees / clearers that have no live account yet. */
  candidates(type: AccountType) {
    const noLiveAccount = { users: { none: { deletedAt: null } } };
    return type === 'EMPLOYEE'
      ? this.prisma.employee.findMany({
          where: { deletedAt: null, status: 'ACTIVE', ...noLiveAccount },
          select: { id: true, fullName: true, code: true, department: true },
          orderBy: { fullName: 'asc' },
        })
      : this.prisma.clearer.findMany({
          where: { deletedAt: null, isActive: true, ...noLiveAccount },
          select: { id: true, fullName: true, phone: true },
          orderBy: { fullName: 'asc' },
        });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    await this.assertRoleAssignable(actor, dto.roleId);
    const passwordHash = await this.passwords.hash(dto.password);

    return this.prisma.$transaction(async (tx) => {
      await this.assertOwnerAvailable(tx, dto.accountType, dto.ownerId);
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          roleId: dto.roleId,
          accountType: dto.accountType,
          employeeId: dto.accountType === 'EMPLOYEE' ? dto.ownerId : null,
          clearerId: dto.accountType === 'CLEARER' ? dto.ownerId : null,
        },
        select: LIST_SELECT,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'user',
          entityId: user.id,
          after: user,
        },
        tx,
      );
      return user;
    });
  }

  async update(actor: AuthUser, id: number, dto: UpdateUserDto) {
    const before = await this.findManageable(actor, id);
    if (
      id === actor.id &&
      (dto.roleId !== undefined || dto.isActive === false)
    ) {
      throw new ForbiddenException('مينفعش تغيّر دورك أو توقف حسابك بنفسك');
    }
    if (dto.roleId !== undefined)
      await this.assertRoleAssignable(actor, dto.roleId);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          email: dto.email,
          roleId: dto.roleId,
          isActive: dto.isActive,
          // a deactivated account is logged out at once
          ...(dto.isActive === false ? { sessionId: null } : {}),
        },
        select: LIST_SELECT,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'user',
          entityId: id,
          before,
          after: user,
        },
        tx,
      );
      return user;
    });
  }

  async resetPassword(actor: AuthUser, id: number, password: string) {
    await this.findManageable(actor, id);
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          sessionId: null,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'PASSWORD_RESET',
          entity: 'user',
          entityId: id,
        },
        tx,
      );
    });
  }

  async remove(actor: AuthUser, id: number) {
    if (id === actor.id)
      throw new ForbiddenException('مينفعش تمسح حسابك بنفسك');
    const before = await this.findManageable(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: actor.id,
          isActive: false,
          sessionId: null,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'user',
          entityId: id,
          before,
        },
        tx,
      );
    });
  }

  /** The target must exist, and only the CEO may manage a CEO account. */
  private async findManageable(actor: AuthUser, id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: LIST_SELECT,
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (user.role.isSystem && !actor.role.isSystem) {
      throw new ForbiddenException('حسابات الـ CEO يعدلها الـ CEO بس');
    }
    return user;
  }

  private async assertRoleAssignable(actor: AuthUser, roleId: number) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException('الدور غير موجود');
    if (role.isSystem && !actor.role.isSystem) {
      throw new ForbiddenException('دور الـ CEO يديه الـ CEO بس');
    }
  }

  private async assertOwnerAvailable(
    tx: Tx,
    type: AccountType,
    ownerId: number,
  ) {
    const owner =
      type === 'EMPLOYEE'
        ? await tx.employee.findFirst({
            where: { id: ownerId, deletedAt: null, status: 'ACTIVE' },
            select: { id: true },
          })
        : await tx.clearer.findFirst({
            where: { id: ownerId, deletedAt: null, isActive: true },
            select: { id: true },
          });
    if (!owner) {
      throw new BadRequestException(
        type === 'EMPLOYEE'
          ? 'الموظف غير موجود أو مش شغال'
          : 'المستخلص غير موجود أو موقوف',
      );
    }
    const existing = await tx.user.count({
      where: {
        deletedAt: null,
        ...(type === 'EMPLOYEE'
          ? { employeeId: ownerId }
          : { clearerId: ownerId }),
      },
    });
    if (existing > 0) throw new ConflictException('عنده حساب بالفعل');
  }
}
