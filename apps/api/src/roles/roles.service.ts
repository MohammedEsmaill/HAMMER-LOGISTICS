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
    }));
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
    const permissions = this.validatePermissions(dto.permissions);
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
    const before = await this.findEditable(id);
    const permissions =
      dto.permissions === undefined
        ? undefined
        : this.validatePermissions(dto.permissions);
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
    const before = await this.findEditable(id);
    const users = await this.prisma.user.count({
      where: { roleId: id, deletedAt: null },
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

  private async findEditable(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (role.isSystem) {
      throw new ForbiddenException('دور الـ CEO ميتعدلش ولا يتمسح');
    }
    return role;
  }

  private validatePermissions(input: string[]): Permission[] {
    const unknown = input.filter((p) => !isPermission(p));
    if (unknown.length) {
      throw new BadRequestException(
        `صلاحيات غير معروفة: ${unknown.join(', ')}`,
      );
    }
    const permissions = input as Permission[];
    const reserved = permissions.filter((p) => CEO_ONLY_PERMISSIONS.has(p));
    if (reserved.length) {
      throw new BadRequestException(
        `الصلاحيات دي للـ CEO بس: ${reserved.map((p) => PERMISSIONS[p]).join('، ')}`,
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
