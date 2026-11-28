import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import {
  CEO_ONLY_PERMISSIONS,
  isPermission,
  MODERATOR_PERMISSIONS,
  MODERATOR_ROLE,
  HEAD_MANAGER_ROLE,
  mayHold,
  Permission,
  PERMISSIONS,
} from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  catalog() {
    return Object.entries(PERMISSIONS).map(([key, label]) => ({
      key,
      label,
      ceoOnly: CEO_ONLY_PERMISSIONS.has(key as Permission),
      /** only the CEO and the moderator role hold it */
      moderatorOnly: MODERATOR_PERMISSIONS.has(key as Permission),
    }));
  }

  options() {
    return this.prisma.role.findMany({
      select: { id: true, name: true, description: true, isSystem: true },
      orderBy: { id: 'asc' },
    });
  }

  list() {
    return this.prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { users: { where: { deletedAt: null } } } },
      },
    });
  }

  async create(actor: AuthUser, dto: CreateRoleDto) {
    const permissions = this.validatePermissions(dto.permissions, dto.name);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { name: dto.name, description: dto.description, permissions },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'role',
          entityId: role.id,
          after: role,
        },
        tx,
      );
      return role;
    });
  }

  async update(actor: AuthUser, id: number, dto: UpdateRoleDto) {
    const before = await this.findEditable(id, actor);
    // the moderator's and the head manager's permissions hang on their names
    for (const fixed of [MODERATOR_ROLE, HEAD_MANAGER_ROLE]) {
      if (before.name === fixed && dto.name !== undefined && dto.name !== fixed) {
        throw new BadRequestException(`اسم دور ${fixed} مبيتغيرش`);
      }
    }
    if (dto.name === HEAD_MANAGER_ROLE && before.name !== HEAD_MANAGER_ROLE) {
      throw new BadRequestException('الاسم ده محجوز لدور المدير العام');
    }
    const permissions =
      dto.permissions === undefined
        ? undefined
        : this.validatePermissions(dto.permissions, dto.name ?? before.name);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id },
        data: { name: dto.name, description: dto.description, permissions },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'role',
          entityId: id,
          before,
          after: role,
        },
        tx,
      );
      return role;
    });
  }

  async remove(actor: AuthUser, id: number) {
    const before = await this.findEditable(id, actor);
    if (before.name === HEAD_MANAGER_ROLE) throw new BadRequestException('دور المدير العام مبيتمسحش');
    const users = await this.prisma.user.count({
      where: {
        deletedAt: null,
        OR: [{ roleId: id }, { extraRoles: { some: { roleId: id } } }],
      },
    });
    if (users > 0) {
      throw new ConflictException(
        `الدور ده عليه ${users} مستخدم، انقلهم لدور تاني الأول`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'role',
          entityId: id,
          before,
        },
        tx,
      );
    });
  }

  private async findEditable(id: number, actor: AuthUser) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (role.isSystem) {
      throw new ForbiddenException('دور الـ CEO ميتعدلش ولا يتمسح');
    }
    if (role.name === HEAD_MANAGER_ROLE && !actor.role.isSystem) {
      throw new ForbiddenException('دور المدير العام يعدّله الـ CEO بس');
    }
    return role;
  }

  private validatePermissions(input: string[], roleName: string): Permission[] {
    const unknown = input.filter((p) => !isPermission(p));
    if (unknown.length) {
      throw new BadRequestException(
        `صلاحيات غير معروفة: ${unknown.join(', ')}`,
      );
    }
    const permissions = input as Permission[];
    if (roleName === HEAD_MANAGER_ROLE) {
      const not = permissions.filter((p) => !mayHold(roleName, p));
      if (not.length) throw new BadRequestException(`المدير العام مبياخدش: ${not.map((p) => PERMISSIONS[p]).join('، ')}`);
      return permissions;
    }
    const reserved = permissions.filter((p) => CEO_ONLY_PERMISSIONS.has(p));
    if (reserved.length) {
      throw new BadRequestException(
        `الصلاحيات دي للـ CEO بس: ${reserved.map((p) => PERMISSIONS[p]).join('، ')}`,
      );
    }
    const moderatorOnly = permissions.filter(
      (p) => MODERATOR_PERMISSIONS.has(p) && roleName !== MODERATOR_ROLE,
    );
    if (moderatorOnly.length) {
      throw new BadRequestException(
        `الصلاحيات دي للـ CEO والموديريتور بس: ${moderatorOnly.map((p) => PERMISSIONS[p]).join('، ')}`,
      );
    }
    if (
      permissions.includes('shipments.view.all') &&
      permissions.includes('shipments.view.own')
    ) {
      throw new BadRequestException(
        'اختار "عرض كل الشحنات" أو "عرض الشحنات المسؤول عنها بس"، مش الاتنين',
      );
    }
    return permissions;
  }
}
