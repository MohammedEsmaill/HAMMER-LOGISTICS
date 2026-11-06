import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransportKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { CreatePortDto, PortsQueryDto, UpdatePortDto } from './dto/lookup.dto';

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

  list(lookup: SimpleLookup, kind?: TransportKind, search?: string) {
    const name = contains(search);
    const orderBy = { name: 'asc' } as const;
    switch (lookup) {
      case 'carriers':
        return this.prisma.carrier.findMany({ where: { kind, name }, orderBy });
      case 'storage-yards':
        return this.prisma.storageYard.findMany({
          where: { kind, name },
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

  async create(
    actor: AuthUser,
    lookup: SimpleLookup,
    name: string,
    kind?: TransportKind,
  ) {
    if (KIND_LOOKUPS.has(lookup) && !kind) {
      throw new BadRequestException('لازم تحدد النوع: بحري أو جوي');
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await this.createRow(tx, lookup, name, kind!);
      await this.log(tx, actor, 'CREATE', lookup, row.id, null, row);
      return row;
    });
  }

  async rename(
    actor: AuthUser,
    lookup: SimpleLookup,
    id: number,
    name: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.findRow(tx, lookup, id);
      const row = await this.renameRow(tx, lookup, id, name);
      await this.log(tx, actor, 'UPDATE', lookup, id, before, row);
      return row;
    });
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

  private createRow(
    tx: Tx,
    lookup: SimpleLookup,
    name: string,
    kind: TransportKind,
  ) {
    switch (lookup) {
      case 'carriers':
        return tx.carrier.create({ data: { name, kind } });
      case 'storage-yards':
        return tx.storageYard.create({ data: { name, kind } });
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

  private renameRow(tx: Tx, lookup: SimpleLookup, id: number, name: string) {
    const args = { where: { id }, data: { name } };
    switch (lookup) {
      case 'carriers':
        return tx.carrier.update(args);
      case 'storage-yards':
        return tx.storageYard.update(args);
      case 'free-zones':
        return tx.freeZone.update(args);
      case 'inspection-authorities':
        return tx.inspectionAuthority.update(args);
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
