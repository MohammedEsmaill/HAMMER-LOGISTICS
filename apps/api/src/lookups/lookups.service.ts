import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransportKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import {
  CreateLookupDto,
  CreatePortDto,
  KindQueryDto,
  PortsQueryDto,
  UpdateLookupDto,
  UpdatePortDto,
} from './dto/lookup.dto';

/** Lists whose rows are just a name; carriers and storage yards also carry a SEA / AIR kind. */
export const SIMPLE_LOOKUPS = [
  'carriers',
  'free-zones',
  'storage-yards',
  'inspection-authorities',
] as const;
export type SimpleLookup = (typeof SIMPLE_LOOKUPS)[number];

const KIND_LOOKUPS: ReadonlySet<SimpleLookup> = new Set([
  'carriers',
  'storage-yards',
]);

const contains = (search?: string) =>
  search ? { contains: search, mode: 'insensitive' as const } : undefined;

@Injectable()
export class LookupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  countries(search?: string) {
    return this.prisma.country.findMany({
      where: search
        ? {
            OR: [
              { nameAr: contains(search) },
              { nameEn: contains(search) },
              { code: search.toUpperCase() },
            ],
          }
        : undefined,
      orderBy: { nameAr: 'asc' },
    });
  }

  ports(query: PortsQueryDto) {
    return this.prisma.port.findMany({
      where: {
        kind: query.kind,
        isEgyptian: query.egyptian,
        ...(query.search
          ? {
              OR: [
                { name: contains(query.search) },
                { code: query.search.toUpperCase() },
              ],
            }
          : {}),
      },
      include: { country: { select: { code: true, nameAr: true } } },
      orderBy: [{ isEgyptian: 'desc' }, { name: 'asc' }],
    });
  }

  list(lookup: SimpleLookup, query: KindQueryDto) {
    const { kind, portId } = query;
    const name = contains(query.search);
    const orderBy = { name: 'asc' } as const;
    switch (lookup) {
      case 'carriers':
        return this.prisma.carrier.findMany({
          where: { kind, name },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
      case 'storage-yards':
        return this.prisma.storageYard.findMany({
          where: { kind, name, portId },
          include: { port: { select: { id: true, name: true, code: true } } },
          orderBy,
        });
      case 'free-zones':
        return this.prisma.freeZone.findMany({ where: { name }, orderBy });
      case 'inspection-authorities':
        return this.prisma.inspectionAuthority.findMany({
          where: { name },
          orderBy,
        });
    }
  }

  async createPort(actor: AuthUser, dto: CreatePortDto) {
    return this.prisma.$transaction(async (tx) => {
      const country = await tx.country.findUnique({
        where: { id: dto.countryId },
      });
      if (!country) throw new NotFoundException('الدولة غير موجودة');
      const port = await tx.port.create({
        data: { ...dto, isEgyptian: country.code === 'EG' },
      });
      await this.log(tx, actor, 'CREATE', 'port', port.id, null, port);
      return port;
    });
  }

  async updatePort(actor: AuthUser, id: number, dto: UpdatePortDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.port.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('الميناء غير موجود');
      const port = await tx.port.update({ where: { id }, data: dto });
      await this.log(tx, actor, 'UPDATE', 'port', id, before, port);
      return port;
    });
  }

  async create(actor: AuthUser, lookup: SimpleLookup, dto: CreateLookupDto) {
    if (KIND_LOOKUPS.has(lookup) && !dto.kind) {
      throw new BadRequestException('لازم تحدد النوع: بحري أو جوي');
    }
    this.assertFieldsFit(lookup, dto);
    return this.prisma.$transaction(async (tx) => {
      if (dto.portId) await this.assertYardPort(tx, dto.portId, dto.kind!);
      const row = await this.createRow(tx, lookup, dto);
      await this.log(tx, actor, 'CREATE', lookup, row.id, null, row);
      return row;
    });
  }

  async update(
    actor: AuthUser,
    lookup: SimpleLookup,
    id: number,
    dto: UpdateLookupDto,
  ) {
    this.assertFieldsFit(lookup, dto);
    return this.prisma.$transaction(async (tx) => {
      const before = await this.findRow(tx, lookup, id);
      if (dto.portId) {
        // assertFieldsFit guarantees this is a storage yard
        const yard = await tx.storageYard.findUniqueOrThrow({ where: { id } });
        await this.assertYardPort(tx, dto.portId, yard.kind);
      }
      const row = await this.updateRow(tx, lookup, id, dto);
      await this.log(tx, actor, 'UPDATE', lookup, id, before, row);
      return row;
    });
  }

  /** sortOrder belongs to carriers, portId to storage yards. */
  private assertFieldsFit(
    lookup: SimpleLookup,
    dto: { sortOrder?: number; portId?: number | null },
  ) {
    if (dto.sortOrder !== undefined && lookup !== 'carriers') {
      throw new BadRequestException(
        'الترتيب للخطوط الملاحية وشركات الطيران بس',
      );
    }
    if (dto.portId !== undefined && lookup !== 'storage-yards') {
      throw new BadRequestException('الميناء للساحات بس');
    }
  }

  /** A yard sits in an Egyptian port (sea) or airport (air) of its own kind. */
  private async assertYardPort(tx: Tx, portId: number, kind: TransportKind) {
    const port = await tx.port.findUnique({ where: { id: portId } });
    if (!port || !port.isEgyptian || port.kind !== kind) {
      throw new BadRequestException(
        kind === 'SEA'
          ? 'الساحة لازم تتبع ميناء مصري'
          : 'المخزن لازم يتبع مطار مصري',
      );
    }
  }

  /** Refused with 409 by the foreign keys while any shipment uses the row. */
  async remove(actor: AuthUser, lookup: SimpleLookup | 'ports', id: number) {
    await this.prisma.$transaction(async (tx) => {
      if (lookup === 'ports') {
        const before = await tx.port.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('الميناء غير موجود');
        await tx.port.delete({ where: { id } });
        await this.log(tx, actor, 'DELETE', 'port', id, before, null);
        return;
      }
      const before = await this.findRow(tx, lookup, id);
      await this.deleteRow(tx, lookup, id);
      await this.log(tx, actor, 'DELETE', lookup, id, before, null);
    });
  }

  private createRow(tx: Tx, lookup: SimpleLookup, dto: CreateLookupDto) {
    const { name } = dto;
    switch (lookup) {
      case 'carriers':
        return tx.carrier.create({
          data: { name, kind: dto.kind!, sortOrder: dto.sortOrder },
        });
      case 'storage-yards':
        return tx.storageYard.create({
          data: { name, kind: dto.kind!, portId: dto.portId },
        });
      case 'free-zones':
        return tx.freeZone.create({ data: { name } });
      case 'inspection-authorities':
        return tx.inspectionAuthority.create({ data: { name } });
    }
  }

  private async findRow(tx: Tx, lookup: SimpleLookup, id: number) {
    const where = { where: { id } };
    const row =
      lookup === 'carriers'
        ? await tx.carrier.findUnique(where)
        : lookup === 'storage-yards'
          ? await tx.storageYard.findUnique(where)
          : lookup === 'free-zones'
            ? await tx.freeZone.findUnique(where)
            : await tx.inspectionAuthority.findUnique(where);
    if (!row) throw new NotFoundException('غير موجود');
    return row;
  }

  private updateRow(
    tx: Tx,
    lookup: SimpleLookup,
    id: number,
    dto: UpdateLookupDto,
  ) {
    const where = { id };
    const { name } = dto;
    switch (lookup) {
      case 'carriers':
        return tx.carrier.update({
          where,
          data: { name, sortOrder: dto.sortOrder },
        });
      case 'storage-yards':
        return tx.storageYard.update({
          where,
          data: { name, portId: dto.portId },
        });
      case 'free-zones':
        return tx.freeZone.update({ where, data: { name } });
      case 'inspection-authorities':
        return tx.inspectionAuthority.update({ where, data: { name } });
    }
  }

  private deleteRow(tx: Tx, lookup: SimpleLookup, id: number) {
    const args = { where: { id } };
    switch (lookup) {
      case 'carriers':
        return tx.carrier.delete(args);
      case 'storage-yards':
        return tx.storageYard.delete(args);
      case 'free-zones':
        return tx.freeZone.delete(args);
      case 'inspection-authorities':
        return tx.inspectionAuthority.delete(args);
    }
  }

  private log(
    tx: Tx,
    actor: AuthUser,
    action: string,
    entity: string,
    entityId: number,
    before: object | null,
    after: object | null,
  ) {
    return this.audit.log(
      { userId: actor.id, action, entity, entityId, before, after },
      tx,
    );
  }
}
