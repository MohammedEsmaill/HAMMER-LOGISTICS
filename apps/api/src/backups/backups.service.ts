import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { AppConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { dump, pgTarget, PgTarget, restore, run } from './pg-tools';

export type BackupKind = 'AUTO' | 'MANUAL' | 'PRE_RESTORE' | 'PRE_UPDATE' | 'UPLOADED';

export interface BackupInfo {
  name: string;
  kind: BackupKind;
  createdAt: string;
  size: number;
  by: string | null;
}

/** hammer_2026-11-16_02-00-05_auto.dump */
const NAME =
  /^hammer_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_(auto|manual|pre_restore|pre_update|uploaded)\.dump$/;
const DAY_MS = 86_400_000;

function cairoStamp(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
}

const absolute = (dir: string) =>
  isAbsolute(dir) ? dir : resolve(process.cwd(), dir);

/**
 * Database backups: one a day by itself (or at start when the last is over a day old),
 * by hand, uploaded from another machine; the newest are kept, each copied to a second
 * folder when set. Uploaded files (the documents) are mirrored next to them. A restore
 * first backs up the current data, then replaces the database and brings it up to date.
 */
@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);
  private readonly dir: string;
  private readonly copyDir: string | null;
  private readonly uploads: string;
  private readonly keep: number;
  private timer?: NodeJS.Timeout;
  private busy: string | null = null;
  private target?: Promise<PgTarget>;
  lastError: string | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.dir = absolute(config.get('BACKUP_DIR', { infer: true }) || 'backups');
    const copy = config.get('BACKUP_COPY_DIR', { infer: true });
    this.copyDir = copy ? absolute(copy) : null;
    this.uploads = absolute(
      config.get('UPLOAD_DIR', { infer: true }) || 'uploads',
    );
    this.keep = config.get('BACKUP_KEEP', { infer: true }) || 30;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // a minute after start, then every hour: a backup when the last is a day old
    setTimeout(() => void this.autoIfDue(), 60_000).unref();
    this.timer = setInterval(() => void this.autoIfDue(), 3600_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private pg() {
    this.target ??= pgTarget(
      this.config.get('DATABASE_URL', { infer: true }),
      this.config.get('BACKUP_PG', { infer: true }) || 'auto',
      this.config.get('BACKUP_COMPOSE_FILE', { infer: true }),
    ).catch((e: Error) => {
      this.target = undefined; // try again next time (docker may start later)
      throw e;
    });
    return this.target;
  }

  async autoIfDue() {
    try {
      const last = (await this.list()).find((b) => b.kind === 'AUTO');
      if (last && Date.now() - new Date(last.createdAt).getTime() < DAY_MS)
        return;
      await this.create('AUTO', null);
    } catch (e) {
      this.lastError = String((e as Error).message ?? e);
      this.logger.error(`Automatic backup failed: ${this.lastError}`);
    }
  }

  async status() {
    const backups = await this.list();
    let mode: string | null = null;
    try {
      mode = (await this.pg()).mode;
    } catch (e) {
      this.lastError ??= (e as Error).message;
    }
    return {
      dir: this.dir,
      copyDir: this.copyDir,
      keep: this.keep,
      mode,
      busy: this.busy,
      lastError: this.lastError,
      lastAuto: backups.find((b) => b.kind === 'AUTO')?.createdAt ?? null,
      backups,
    };
  }

  async list(): Promise<BackupInfo[]> {
    if (!existsSync(this.dir)) return [];
    const names = (await readdir(this.dir)).filter((n) => NAME.test(n));
    const rows = await Promise.all(
      names.map(async (name) => {
        const meta: Partial<BackupInfo> = await readFile(
          join(this.dir, `${name}.json`),
          'utf8',
        )
          .then((t) => JSON.parse(t) as Partial<BackupInfo>)
          .catch(() => ({}));
        const s = await stat(join(this.dir, name));
        return {
          name,
          kind: (NAME.exec(name)![1].toUpperCase() as BackupKind) ?? 'MANUAL',
          createdAt: meta.createdAt ?? s.mtime.toISOString(),
          size: s.size,
          by: meta.by ?? null,
        };
      }),
    );
    return rows.sort((a, b) => b.name.localeCompare(a.name));
  }

  private async guard<T>(what: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy)
      throw new ConflictException(
        `فيه عملية شغالة دلوقتي (${this.busy})، استنى لما تخلص`,
      );
    this.busy = what;
    try {
      return await fn();
    } finally {
      this.busy = null;
    }
  }

  async create(kind: BackupKind, by: string | null): Promise<BackupInfo> {
    return this.guard('نسخة احتياطية', () => this.write(kind, by));
  }

  private async write(
    kind: BackupKind,
    by: string | null,
  ): Promise<BackupInfo> {
    await mkdir(this.dir, { recursive: true });
    const name = `hammer_${cairoStamp()}_${kind.toLowerCase()}.dump`;
    const file = join(this.dir, name);
    const partial = `${file}.part`;
    try {
      await dump(await this.pg(), partial);
      await this.assertDump(partial);
      await rename(partial, file);
    } catch (e) {
      await rm(partial, { force: true });
      throw e;
    }
    const info: BackupInfo = {
      name,
      kind,
      createdAt: new Date().toISOString(),
      size: (await stat(file)).size,
      by,
    };
    await writeFile(`${file}.json`, JSON.stringify(info));
    this.lastError = null;
    await this.prune(this.dir);
    await this.mirrorUploads(join(this.dir, 'uploads'));
    if (this.copyDir) {
      try {
        await mkdir(this.copyDir, { recursive: true });
        await copyFile(file, join(this.copyDir, name));
        await copyFile(`${file}.json`, join(this.copyDir, `${name}.json`));
        await this.prune(this.copyDir);
        await this.mirrorUploads(join(this.copyDir, 'uploads'));
      } catch (e) {
        this.lastError = `اتعملت النسخة بس ماتنسختش للفولدر التاني: ${(e as Error).message}`;
        this.logger.warn(this.lastError);
      }
    }
    this.logger.log(`Backup ${name} (${info.size} bytes)`);
    return info;
  }

  /** Keeps the newest backups. */
  private async prune(dir: string) {
    const names = (await readdir(dir))
      .filter((n) => NAME.test(n))
      .sort()
      .reverse();
    for (const name of names.slice(this.keep)) {
      await rm(join(dir, name), { force: true });
      await rm(join(dir, `${name}.json`), { force: true });
    }
  }

  /** Copies the uploaded documents not copied yet (they never change once uploaded). */
  private async mirrorUploads(to: string) {
    if (!existsSync(this.uploads)) return;
    await mkdir(to, { recursive: true });
    for (const name of await readdir(this.uploads)) {
      const target = join(to, name);
      if (!existsSync(target))
        await copyFile(join(this.uploads, name), target).catch(() => undefined);
    }
  }

  /** A pg_dump custom file starts with PGDMP. */
  private async assertDump(file: string) {
    const fd = await open(file, 'r');
    try {
      const head = Buffer.alloc(5);
      await fd.read(head, 0, 5, 0);
      if (head.toString() !== 'PGDMP')
        throw new BadRequestException('الملف ده مش نسخة احتياطية من السيستم');
    } finally {
      await fd.close();
    }
  }

  path(name: string): string {
    if (!NAME.test(name) || basename(name) !== name)
      throw new NotFoundException('النسخة غير موجودة');
    const file = join(this.dir, name);
    if (!existsSync(file)) throw new NotFoundException('النسخة غير موجودة');
    return file;
  }

  /** A backup from another machine, kept like the others. */
  async upload(actor: AuthUser, tmpFile: string): Promise<BackupInfo> {
    return this.guard('رفع نسخة', async () => {
      try {
        await this.assertDump(tmpFile);
        await mkdir(this.dir, { recursive: true });
        const name = `hammer_${cairoStamp()}_uploaded.dump`;
        const file = join(this.dir, name);
        await copyFile(tmpFile, file);
        const info: BackupInfo = {
          name,
          kind: 'UPLOADED',
          createdAt: new Date().toISOString(),
          size: (await stat(file)).size,
          by: actor.email,
        };
        await writeFile(`${file}.json`, JSON.stringify(info));
        await this.audit.log({
          userId: actor.id,
          action: 'CREATE',
          entity: 'backup',
          entityId: name,
          after: info,
        });
        return info;
      } finally {
        await rm(tmpFile, { force: true });
      }
    });
  }

  /**
   * Replaces the data with a backup: the current data is backed up first, the restore
   * is one transaction (all or nothing), then the database is brought up to this
   * version's structure.
   */
  async restore(actor: AuthUser, name: string) {
    const file = this.path(name);
    return this.guard('استرجاع نسخة', async () => {
      const before = await this.write('PRE_RESTORE', actor.email);
      await restore(await this.pg(), file);
      await run('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd() });
      // written after the restore, so it is not lost with the replaced data
      await this.audit.log({
        userId: (await this.prisma.user.findUnique({ where: { id: actor.id } }))
          ? actor.id
          : null,
        action: 'UPDATE',
        entity: 'backup',
        entityId: name,
        after: { restored: name, savedFirst: before.name },
      });
      this.logger.warn(
        `Restored ${name} (current data saved as ${before.name})`,
      );
      return { restored: name, savedFirst: before.name };
    });
  }

  async remove(actor: AuthUser, name: string) {
    const file = this.path(name);
    await rm(file, { force: true });
    await rm(`${file}.json`, { force: true });
    await this.audit.log({
      userId: actor.id,
      action: 'DELETE',
      entity: 'backup',
      entityId: name,
    });
  }
}
