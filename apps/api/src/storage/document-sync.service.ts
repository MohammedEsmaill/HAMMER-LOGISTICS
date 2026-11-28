import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryStorage } from './cloudinary.storage';
import { FileExt } from './file-storage';
import { partyFolder, shipmentFolder } from './folders';
import { LocalDiskStorage } from './local-disk.storage';

const BATCH = 20;

/**
 * Uploads the files still on this server's disk only: those saved while the internet
 * was down, and the old ones from before Cloudinary was configured. Every minute while
 * Cloudinary is configured; the copy on disk stays as a backup.
 */
@Injectable()
export class DocumentSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentSyncService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  /** files missing from disk: logged once, not retried every minute */
  private readonly missing = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly disk: LocalDiskStorage,
    private readonly cloud: CloudinaryStorage,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || !this.cloud.configured) return;
    setTimeout(() => void this.run(), 30_000).unref();
    this.timer = setInterval(() => void this.run(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; returns how many files went up. */
  async run(): Promise<number> {
    if (this.running || !this.cloud.configured) return 0;
    this.running = true;
    let done = 0;
    try {
      const shipments = await this.prisma.shipmentDocument.findMany({
        where: { publicId: { startsWith: 'local:' }, deletedAt: null },
        select: { id: true, localKey: true, section: true, shipment: { select: { fileNo: true } } },
        take: BATCH,
      });
      for (const d of shipments) {
        const up = await this.push(d.localKey, shipmentFolder(d.shipment.fileNo, d.section));
        if (!up) continue;
        await this.prisma.shipmentDocument.update({ where: { id: d.id }, data: up });
        done++;
      }
      const parties = await this.prisma.partyDocument.findMany({
        where: { publicId: { startsWith: 'local:' } },
        select: { id: true, localKey: true, client: { select: { name: true } }, factory: { select: { name: true } } },
        take: BATCH,
      });
      for (const d of parties) {
        const up = await this.push(d.localKey, partyFolder(d.client, d.factory));
        if (!up) continue;
        await this.prisma.partyDocument.update({ where: { id: d.id }, data: up });
        done++;
      }
    } catch (e) {
      // still offline: the next pass tries again
      this.logger.warn(`Upload pass stopped: ${String(e)}`);
    } finally {
      this.running = false;
    }
    if (done) this.logger.log(`Uploaded ${done} file(s) to Cloudinary`);
    return done;
  }

  private async push(localKey: string | null, folder: string) {
    if (!localKey || this.missing.has(localKey)) return null;
    const file = await this.disk.read(localKey);
    if (!file) {
      this.missing.add(localKey);
      this.logger.error(`${localKey} is not on disk: it cannot go up to Cloudinary`);
      return null;
    }
    const ext = localKey.split('.').pop() as FileExt;
    const stored = await this.cloud.upload(file, { folder, fileName: randomUUID(), ext });
    return { url: stored.url, publicId: stored.publicId };
  }
}
