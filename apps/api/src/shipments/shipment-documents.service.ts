import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage';
import { shipmentScope } from './access-scope';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_SELECT = {
  id: true,
  name: true,
  fileName: true,
  url: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploadedBy: { select: { id: true, email: true } },
} satisfies Prisma.ShipmentDocumentSelect;

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

/** Shipment documents: PDF only, up to 10 MB, any number per shipment. */
@Injectable()
export class ShipmentDocumentsService {
  private readonly logger = new Logger(ShipmentDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async list(actor: AuthUser, shipmentId: number) {
    await this.findShipment(actor, shipmentId);
    return this.prisma.shipmentDocument.findMany({
      where: { shipmentId, deletedAt: null },
      select: DOCUMENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    actor: AuthUser,
    shipmentId: number,
    name: string,
    file: UploadedFile | undefined,
  ) {
    const shipment = await this.findShipment(actor, shipmentId);
    this.assertPdf(file);

    const stored = await this.storage.upload(file.buffer, {
      folder: `shipments/${shipment.fileNo}`,
      fileName: randomUUID(),
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const document = await tx.shipmentDocument.create({
          data: {
            shipmentId,
            name,
            fileName: decodeFileName(file.originalname),
            url: stored.url,
            publicId: stored.publicId,
            mimeType: 'application/pdf',
            size: file.size,
            uploadedById: actor.id,
          },
          select: DOCUMENT_SELECT,
        });
        await this.audit.log(
          {
            userId: actor.id,
            action: 'UPLOAD',
            entity: 'shipment_document',
            entityId: document.id,
            after: { ...document, shipmentId },
          },
          tx,
        );
        return document;
      });
    } catch (error) {
      // the row was not saved: do not leave an orphan file behind
      await this.storage
        .remove(stored.publicId)
        .catch((e: unknown) =>
          this.logger.error(`Orphan file ${stored.publicId}: ${String(e)}`),
        );
      throw error;
    }
  }

  /** Soft delete: the row and the file stay, hidden from the shipment. */
  async remove(actor: AuthUser, shipmentId: number, documentId: number) {
    await this.findShipment(actor, shipmentId);
    const document = await this.prisma.shipmentDocument.findFirst({
      where: { id: documentId, shipmentId, deletedAt: null },
      select: DOCUMENT_SELECT,
    });
    if (!document) throw new NotFoundException('المستند غير موجود');
    await this.prisma.$transaction(async (tx) => {
      await tx.shipmentDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date(), deletedById: actor.id },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'shipment_document',
          entityId: documentId,
          before: { ...document, shipmentId },
        },
        tx,
      );
    });
  }

  private async findShipment(actor: AuthUser, id: number) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { AND: [{ id }, shipmentScope(actor)] },
      select: { id: true, fileNo: true },
    });
    if (!shipment) throw new NotFoundException('الشحنة غير موجودة');
    return shipment;
  }

  /** Checks the content, not the extension: a PDF starts with "%PDF-". */
  private assertPdf(
    file: UploadedFile | undefined,
  ): asserts file is UploadedFile {
    if (!file || file.size === 0) {
      throw new BadRequestException('اختار ملف PDF');
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('حجم الملف أكبر من 10 ميجا');
    }
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException('الملف لازم يكون PDF');
    }
  }
}

/** Multer reads multipart file names as latin1; Arabic names need decoding back to UTF-8. */
function decodeFileName(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
}
