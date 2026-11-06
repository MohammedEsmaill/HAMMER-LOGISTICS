import {
  BadRequestException,
  ConflictException,
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
  ClientsQueryDto,
  CreateClientDto,
  CreateFactoryDto,
  UpdateClientDto,
  UpdateFactoryDto,
} from './dto/client.dto';

const QUOTE_FIELDS = [
  'quoteFinalBase',
  'quoteTemporaryBase',
  'quoteImportExtraContainer',
  'quoteExportBase',
  'quoteExportExtraContainer',
] as const;

const FACTORY_SELECT = {
  id: true,
  clientId: true,
  name: true,
  taxNumber: true,
  commercialRegister: true,
  address: true,
} satisfies Prisma.FactorySelect;

const OPERATION_EMPLOYEE = { select: { id: true, fullName: true } } as const;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser, query: ClientsQueryDto): Promise<Page<unknown>> {
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { mobile: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        select: {
          ...this.select(actor),
          _count: { select: { factories: { where: { deletedAt: null } } } },
        },
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.client.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(actor: AuthUser, id: number) {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...this.select(actor),
        factories: {
          where: { deletedAt: null },
          select: FACTORY_SELECT,
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!client) throw new NotFoundException('العميل غير موجود');
    return client;
  }

  /** Factories of one client, for the shipment form. */
  async factories(clientId: number) {
    await this.findClient(clientId);
    return this.prisma.factory.findMany({
      where: { clientId, deletedAt: null },
      select: FACTORY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: AuthUser, dto: CreateClientDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertOperationEmployee(tx, dto.importOperationEmployeeId);
      if (dto.exportOperationEmployeeId) {
        await this.assertOperationEmployee(tx, dto.exportOperationEmployeeId);
      }
      const created = await tx.client.create({
        data: {
          name: dto.name,
          mobile: dto.mobile,
          email: dto.email,
          importOperationEmployeeId: dto.importOperationEmployeeId,
          exportOperationEmployeeId: dto.exportOperationEmployeeId ?? null,
          quoteFinalBase: toDecimal(dto.quoteFinalBase),
          quoteTemporaryBase: toDecimal(dto.quoteTemporaryBase),
          quoteImportExtraContainer: toDecimal(dto.quoteImportExtraContainer),
          quoteExportBase: toDecimal(dto.quoteExportBase),
          quoteExportExtraContainer: toDecimal(dto.quoteExportExtraContainer),
          factories: dto.factories?.length
            ? { create: dto.factories }
            : undefined,
        },
        select: { id: true },
      });
      const client = await this.getIn(tx, actor, created.id);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'client',
          entityId: client.id,
          after: client,
        },
        tx,
      );
      return client;
    });
  }

  async update(actor: AuthUser, id: number, dto: UpdateClientDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.getIn(tx, actor, id);
      if (dto.importOperationEmployeeId) {
        await this.assertOperationEmployee(tx, dto.importOperationEmployeeId);
      }
      if (dto.exportOperationEmployeeId) {
        await this.assertOperationEmployee(tx, dto.exportOperationEmployeeId);
      }
      // Shipments keep the operation employee they were registered with (spec section 4).
      await tx.client.update({
        where: { id },
        data: {
          name: dto.name,
          mobile: dto.mobile,
          email: dto.email,
          importOperationEmployeeId: dto.importOperationEmployeeId,
          exportOperationEmployeeId: dto.exportOperationEmployeeId,
          ...this.quoteData(dto),
        },
      });
      const client = await this.getIn(tx, actor, id);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'client',
          entityId: id,
          before,
          after: client,
        },
        tx,
      );
      return client;
    });
  }

  /** Soft-deletes the client and its factories together; refused while shipments are open. */
  async remove(actor: AuthUser, id: number) {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.getIn(tx, actor, id);
      const active = await tx.shipment.count({
        where: { clientId: id, ...activeShipmentWhere() },
      });
      if (active > 0) {
        throw new ConflictException(`العميل عليه ${active} شحنة شغالة`);
      }
      const stamp = { deletedAt: new Date(), deletedById: actor.id };
      await tx.factory.updateMany({
        where: { clientId: id, deletedAt: null },
        data: stamp,
      });
      await tx.client.update({ where: { id }, data: stamp });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'client',
          entityId: id,
          before,
        },
        tx,
      );
    });
  }

  async addFactory(actor: AuthUser, clientId: number, dto: CreateFactoryDto) {
    await this.findClient(clientId);
    return this.prisma.$transaction(async (tx) => {
      const factory = await tx.factory.create({
        data: { ...dto, clientId },
        select: FACTORY_SELECT,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'factory',
          entityId: factory.id,
          after: factory,
        },
        tx,
      );
      return factory;
    });
  }

  /** A factory never moves to another client: shipments are tied to the pair. */
  async updateFactory(actor: AuthUser, id: number, dto: UpdateFactoryDto) {
    const before = await this.findFactory(id);
    return this.prisma.$transaction(async (tx) => {
      const factory = await tx.factory.update({
        where: { id },
        data: dto,
        select: FACTORY_SELECT,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'factory',
          entityId: id,
          before,
          after: factory,
        },
        tx,
      );
      return factory;
    });
  }

  async removeFactory(actor: AuthUser, id: number) {
    const before = await this.findFactory(id);
    await this.prisma.$transaction(async (tx) => {
      const active = await tx.shipment.count({
        where: { factoryId: id, ...activeShipmentWhere() },
      });
      if (active > 0) {
        throw new ConflictException(`المصنع عليه ${active} شحنة شغالة`);
      }
      await tx.factory.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: actor.id },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'factory',
          entityId: id,
          before,
        },
        tx,
      );
    });
  }

  private select(actor: AuthUser) {
    const quote =
      can(actor, 'clients.manage') || can(actor, 'clients.quote.view');
    return {
      id: true,
      name: true,
      mobile: true,
      email: true,
      importOperationEmployee: OPERATION_EMPLOYEE,
      exportOperationEmployee: OPERATION_EMPLOYEE,
      quoteFinalBase: quote,
      quoteTemporaryBase: quote,
      quoteImportExtraContainer: quote,
      quoteExportBase: quote,
      quoteExportExtraContainer: quote,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.ClientSelect;
  }

  private async getIn(tx: Tx, actor: AuthUser, id: number) {
    const client = await tx.client.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...this.select(actor),
        factories: { where: { deletedAt: null }, select: FACTORY_SELECT },
      },
    });
    if (!client) throw new NotFoundException('العميل غير موجود');
    return client;
  }

  /** Only the quote fields that were sent; the others stay as they are. */
  private quoteData(
    dto: Partial<Record<(typeof QUOTE_FIELDS)[number], number>>,
  ): Partial<Record<(typeof QUOTE_FIELDS)[number], Prisma.Decimal>> {
    return Object.fromEntries(
      QUOTE_FIELDS.filter((f) => dto[f] !== undefined).map((f) => [
        f,
        toDecimal(dto[f]),
      ]),
    );
  }

  private async findClient(id: number) {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('العميل غير موجود');
    return client;
  }

  private async findFactory(id: number) {
    const factory = await this.prisma.factory.findFirst({
      where: { id, deletedAt: null, client: { deletedAt: null } },
      select: FACTORY_SELECT,
    });
    if (!factory) throw new NotFoundException('المصنع غير موجود');
    return factory;
  }

  private async assertOperationEmployee(tx: Tx, employeeId: number) {
    const employee = await tx.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
        status: 'ACTIVE',
        department: 'OPERATION',
      },
      select: { id: true },
    });
    if (!employee) {
      throw new BadRequestException(
        'موظف الأوبريشن لازم يكون موظف شغال في قسم OPERATION',
      );
    }
  }
}
