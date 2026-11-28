import { partyFolder } from '../storage/folders';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser, can } from '../auth/auth-user';
import { operationClientWhere } from '../clients/operation-team';
import { todayCairo } from '../finance/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  FILE_STORAGE,
  type FileExt,
  type FileStorage,
} from '../storage/file-storage';

export const MAX_PARTY_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Days before expiry when a paper counts as expiring. */
export const EXPIRING_DAYS = 30;
const DAY_MS = 86_400_000;
const OTHER_TYPE = 'أخرى';

export interface PartyDocumentInput {
  clientId: number;
  factoryId?: number | null;
  typeId: number;
  title?: string | null;
  number?: string | null;
  issueDate: Date;
  expiryDate: Date;
  notes?: string | null;
}

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export type DocumentStatus = 'VALID' | 'EXPIRING' | 'EXPIRED';

const SELECT = {
  id: true,
  clientId: true,
  factoryId: true,
  title: true,
  number: true,
  issueDate: true,
  expiryDate: true,
  notes: true,
  fileName: true,
  url: true,
  mimeType: true,
  size: true,
  createdAt: true,
  updatedAt: true,
  type: { select: { id: true, name: true } },
  createdBy: { select: { email: true } },
  updatedBy: { select: { email: true } },
} satisfies Prisma.PartyDocumentSelect;

export function daysLeft(expiry: Date, today = todayCairo()) {
  return Math.round((expiry.getTime() - today.getTime()) / DAY_MS);
}

export function statusOf(expiry: Date, today = todayCairo()): DocumentStatus {
  const left = daysLeft(expiry, today);
  return left < 0 ? 'EXPIRED' : left <= EXPIRING_DAYS ? 'EXPIRING' : 'VALID';
}

/** The kind of an uploaded file, from its first bytes (not its name). */
function fileKind(file: UploadedFile): { ext: FileExt; mime: string } {
  const head = file.buffer.subarray(0, 8);
  if (head.subarray(0, 5).toString('latin1') === '%PDF-')
    return { ext: 'pdf', mime: 'application/pdf' };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return { ext: 'jpg', mime: 'image/jpeg' };
  if (
    head
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  throw new BadRequestException('الملف لازم يكون PDF أو صورة (JPG / PNG)');
}

const decodeFileName = (name: string) =>
  Buffer.from(name, 'latin1').toString('utf8');

/**
 * The documents center: the papers of each client, or of each factory when a client has
 * more than one. Operation sees its own clients (as operation employee or reviewer),
 * Nafeza sees all. Renewing replaces the file and the dates.
 */
@Injectable()
export class PartyDocumentsService {
  private readonly logger = new Logger(PartyDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** The clients this user may see the papers of. */
  clientScope(actor: AuthUser): Prisma.ClientWhereInput {
    if (can(actor, 'documents.view.all')) return {};
    if (
      can(actor, 'documents.view.own') &&
      actor.accountType === 'EMPLOYEE' &&
      actor.employeeId
    ) {
      return operationClientWhere(actor.employeeId);
    }
    throw new ForbiddenException('ليس لديك صلاحية لمركز المستندات');
  }

  types() {
    return this.prisma.partyDocumentType.findMany({ orderBy: { id: 'asc' } });
  }

  /**
   * The cards: one per client, or one per factory for a client with several. Each with
   * its data and how many papers are valid, expiring or expired.
   */
  async cards(actor: AuthUser, search?: string) {
    const today = todayCairo();
    const clients = await this.prisma.client.findMany({
      where: {
        AND: [
          { deletedAt: null },
          this.clientScope(actor),
          search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  {
                    factories: {
                      some: {
                        name: { contains: search, mode: 'insensitive' },
                        deletedAt: null,
                      },
                    },
                  },
                ],
              }
            : {},
        ],
      },
      select: {
        id: true,
        name: true,
        factories: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            taxNumber: true,
            commercialRegister: true,
            address: true,
          },
          orderBy: { name: 'asc' },
        },
        documents: { select: { factoryId: true, expiryDate: true } },
      },
      orderBy: { name: 'asc' },
    });
    return clients.flatMap((c) => {
      const several = c.factories.length > 1;
      const parties = several
        ? c.factories.map((f) => ({
            factory: f,
            docs: c.documents.filter((d) => d.factoryId === f.id),
          }))
        : [{ factory: c.factories[0] ?? null, docs: c.documents }];
      return parties.map(({ factory, docs }) => {
        const counts = { VALID: 0, EXPIRING: 0, EXPIRED: 0 };
        for (const d of docs) counts[statusOf(d.expiryDate, today)]++;
        return {
          key: several ? `${c.id}-${factory.id}` : `${c.id}`,
          client: { id: c.id, name: c.name },
          factory: several ? factory : null,
          details: factory,
          counts,
          total: docs.length,
        };
      });
    });
  }

  /** The papers of one card. */
  async list(actor: AuthUser, clientId: number, factoryId?: number) {
    await this.findClient(actor, clientId);
    const today = todayCairo();
    const rows = await this.prisma.partyDocument.findMany({
      where: { clientId, ...(factoryId ? { factoryId } : {}) },
      select: SELECT,
      orderBy: { expiryDate: 'asc' },
    });
    return rows.map((d) => ({
      ...d,
      status: statusOf(d.expiryDate, today),
      daysLeft: daysLeft(d.expiryDate, today),
    }));
  }

  /** For shipment registration: the client's or factory's papers that need attention. */
  async warnings(clientId: number, factoryId?: number) {
    const today = todayCairo();
    const rows = await this.prisma.partyDocument.findMany({
      where: {
        clientId,
        expiryDate: { lte: new Date(today.getTime() + EXPIRING_DAYS * DAY_MS) },
        ...(factoryId ? { OR: [{ factoryId }, { factoryId: null }] } : {}),
      },
      select: {
        title: true,
        expiryDate: true,
        type: { select: { name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
    return rows.map((d) => ({
      name: d.title || d.type.name,
      expiryDate: d.expiryDate,
      status: statusOf(d.expiryDate, today),
      daysLeft: daysLeft(d.expiryDate, today),
    }));
  }

  private async findClient(actor: AuthUser, clientId: number) {
    const client = await this.prisma.client.findFirst({
      where: {
        AND: [{ id: clientId, deletedAt: null }, this.clientScope(actor)],
      },
      select: {
        id: true,
        name: true,
        factories: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (!client) throw new NotFoundException('العميل غير موجود');
    return client;
  }

  /** The owner and the fields: a factory of a client with several is required. */
  private async check(actor: AuthUser, input: PartyDocumentInput) {
    const client = await this.findClient(actor, input.clientId);
    const factoryIds = client.factories.map((f) => f.id);
    if (input.factoryId && !factoryIds.includes(input.factoryId)) {
      throw new BadRequestException('المصنع ده مش تبع العميل');
    }
    if (factoryIds.length > 1 && !input.factoryId) {
      throw new BadRequestException('العميل عنده أكتر من مصنع: اختار المصنع');
    }
    const type = await this.prisma.partyDocumentType.findUnique({
      where: { id: input.typeId },
    });
    if (!type) throw new BadRequestException('نوع المستند غير موجود');
    if (type.name === OTHER_TYPE && !input.title?.trim()) {
      throw new BadRequestException('اكتب اسم المستند');
    }
    if (input.expiryDate < input.issueDate) {
      throw new BadRequestException(
        'تاريخ الانتهاء لازم يكون بعد تاريخ الإصدار',
      );
    }
    if (input.issueDate > todayCairo()) {
      throw new BadRequestException('تاريخ الإصدار مينفعش يبقى في المستقبل');
    }
    // with one factory, the paper is the client's
    return { factoryId: factoryIds.length > 1 ? input.factoryId! : null };
  }

  private async store(file: UploadedFile | undefined, clientId: number, factoryId: number | null) {
    if (!file || file.size === 0)
      throw new BadRequestException('اختار ملف المستند');
    if (file.size > MAX_PARTY_DOCUMENT_BYTES)
      throw new BadRequestException('حجم الملف أكبر من 10 ميجا');
    const kind = fileKind(file);
    const [client, factory] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } }),
      factoryId ? this.prisma.factory.findUnique({ where: { id: factoryId }, select: { name: true } }) : null,
    ]);
    const stored = await this.storage.upload(file.buffer, {
      folder: partyFolder(client, factory),
      fileName: randomUUID(),
      ext: kind.ext,
    });
    return {
      stored,
      data: {
        fileName: decodeFileName(file.originalname),
        url: stored.url,
        publicId: stored.publicId,
        localKey: stored.localKey ?? null,
        mimeType: kind.mime,
        size: file.size,
      },
    };
  }

  private async discard(file: { publicId: string; localKey?: string | null }) {
    const publicId = file.publicId;
    await this.storage
      .remove(publicId, file.localKey)
      .catch((e: unknown) =>
        this.logger.error(`Orphan file ${publicId}: ${String(e)}`),
      );
  }

  async create(
    actor: AuthUser,
    input: PartyDocumentInput,
    file: UploadedFile | undefined,
  ) {
    const { factoryId } = await this.check(actor, input);
    const { stored, data } = await this.store(file, input.clientId, factoryId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const doc = await tx.partyDocument.create({
          data: {
            clientId: input.clientId,
            factoryId,
            typeId: input.typeId,
            title: input.title?.trim() || null,
            number: input.number?.trim() || null,
            issueDate: input.issueDate,
            expiryDate: input.expiryDate,
            notes: input.notes?.trim() || null,
            ...data,
            createdById: actor.id,
          },
          select: SELECT,
        });
        await this.audit.log(
          {
            userId: actor.id,
            action: 'UPLOAD',
            entity: 'party_document',
            entityId: doc.id,
            after: doc,
          },
          tx,
        );
        return doc;
      });
    } catch (error) {
      await this.discard(stored);
      throw error;
    }
  }

  /** Edits the data; with a file it is a renewal: the new file replaces the old one. */
  async update(
    actor: AuthUser,
    id: number,
    input: Omit<PartyDocumentInput, 'clientId'>,
    file?: UploadedFile,
  ) {
    const before = await this.prisma.partyDocument.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('المستند غير موجود');
    const { factoryId } = await this.check(actor, {
      ...input,
      clientId: before.clientId,
    });
    const replaced = file ? await this.store(file, before.clientId, factoryId) : null;
    try {
      const doc = await this.prisma.$transaction(async (tx) => {
        const after = await tx.partyDocument.update({
          where: { id },
          data: {
            factoryId,
            typeId: input.typeId,
            title: input.title?.trim() || null,
            number: input.number?.trim() || null,
            issueDate: input.issueDate,
            expiryDate: input.expiryDate,
            notes: input.notes?.trim() || null,
            ...(replaced?.data ?? {}),
            updatedById: actor.id,
          },
          select: SELECT,
        });
        await this.audit.log(
          {
            userId: actor.id,
            action: replaced ? 'RENEW' : 'UPDATE',
            entity: 'party_document',
            entityId: id,
            before,
            after,
          },
          tx,
        );
        return after;
      });
      if (replaced) await this.discard(before);
      return doc;
    } catch (error) {
      if (replaced) await this.discard(replaced.stored);
      throw error;
    }
  }

  async remove(actor: AuthUser, id: number) {
    const before = await this.prisma.partyDocument.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('المستند غير موجود');
    await this.findClient(actor, before.clientId);
    await this.prisma.$transaction(async (tx) => {
      await tx.partyDocument.delete({ where: { id } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'party_document',
          entityId: id,
          before,
        },
        tx,
      );
    });
    await this.discard(before);
  }
}
