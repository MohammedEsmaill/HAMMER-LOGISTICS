import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, can } from '../auth/auth-user';
import { Page, pageArgs } from '../common/dto/list-query.dto';
import { toDecimal } from '../common/validation';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { activeShipmentWhere } from '../shipments/stages';
import {
  CreateEmployeeDto,
  EmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';

const BASE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  nationalId: true,
  phone: true,
  address: true,
  department: true,
  jobTitle: true,
  hireDate: true,
  status: true,
  leaveDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

/** What a departing operation employee still holds; the CEO hands it over. */
export interface Handover {
  clients: number;
  activeShipments: number;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    actor: AuthUser,
    query: EmployeesQueryDto,
  ): Promise<Page<unknown>> {
    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      department: query.department,
      status: query.status,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search } },
              { nationalId: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: this.select(actor),
        orderBy: { fullName: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Active employees for dropdowns (e.g. a client's operation employee). */
  options(department?: EmployeesQueryDto['department']) {
    return this.prisma.employee.findMany({
      where: { deletedAt: null, status: 'ACTIVE', department },
      select: { id: true, fullName: true, code: true, department: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async get(actor: AuthUser, id: number) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      select: this.select(actor),
    });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    return employee;
  }

  async create(actor: AuthUser, dto: CreateEmployeeDto) {
    this.assertSalaryAccess(actor, dto.basicSalary);
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: { ...dto, basicSalary: toDecimal(dto.basicSalary ?? 0) },
        select: this.select(actor),
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'employee',
          entityId: employee.id,
          after: employee,
        },
        tx,
      );
      return employee;
    });
  }

  async update(actor: AuthUser, id: number, dto: UpdateEmployeeDto) {
    this.assertSalaryAccess(actor, dto.basicSalary);
    const before = await this.get(actor, id);
    const leaving = dto.status === 'LEFT' && before.status !== 'LEFT';
    const returning = dto.status === 'ACTIVE' && before.status === 'LEFT';

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          ...dto,
          basicSalary: toDecimal(dto.basicSalary),
          leaveDate: leaving
            ? (dto.leaveDate ?? new Date())
            : returning
              ? null
              : dto.leaveDate,
        },
        select: this.select(actor),
      });
      if (leaving) await this.closeAccounts(tx, id);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'employee',
          entityId: id,
          before,
          after: employee,
        },
        tx,
      );
      return {
        employee,
        handover: leaving ? await this.handover(tx, id) : null,
      };
    });
  }

  async remove(actor: AuthUser, id: number) {
    const before = await this.get(actor, id);
    await this.prisma.$transaction(async (tx) => {
      const { clients, activeShipments } = await this.handover(tx, id);
      if (clients > 0 || activeShipments > 0) {
        throw new ConflictException(
          `الموظف مسؤول عن ${clients} عميل و${activeShipments} شحنة شغالة، انقلهم لموظف تاني الأول`,
        );
      }
      const now = new Date();
      await tx.employee.update({
        where: { id },
        data: { deletedAt: now, deletedById: actor.id },
      });
      await tx.user.updateMany({
        where: { employeeId: id, deletedAt: null },
        data: {
          deletedAt: now,
          deletedById: actor.id,
          isActive: false,
          sessionId: null,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'employee',
          entityId: id,
          before,
        },
        tx,
      );
    });
  }

  private async closeAccounts(tx: Tx, employeeId: number) {
    await tx.user.updateMany({
      where: { employeeId, deletedAt: null },
      data: { isActive: false, sessionId: null },
    });
  }

  private async handover(tx: Tx, employeeId: number): Promise<Handover> {
    const [clients, activeShipments] = await Promise.all([
      tx.client.count({
        where: {
          deletedAt: null,
          OR: [
            { importOperationEmployeeId: employeeId },
            { exportOperationEmployeeId: employeeId },
          ],
        },
      }),
      tx.shipment.count({
        where: { operationEmployeeId: employeeId, ...activeShipmentWhere() },
      }),
    ]);
    return { clients, activeShipments };
  }

  private select(actor: AuthUser) {
    return {
      ...BASE_SELECT,
      basicSalary: can(actor, 'employees.salary.view'),
    } satisfies Prisma.EmployeeSelect;
  }

  private assertSalaryAccess(actor: AuthUser, salary: number | undefined) {
    if (salary !== undefined && !can(actor, 'employees.salary.view')) {
      throw new ForbiddenException('ليس لديك صلاحية على المرتبات');
    }
  }
}
