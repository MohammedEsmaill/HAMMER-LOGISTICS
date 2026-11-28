import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NotificationsService } from './notifications.service';
import { WhatsappService } from './whatsapp.service';

/** cloudflared prints the link; its own API address is not it. */
const LINK = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;
/** A new link takes a while to answer everywhere: no checks before this. */
const GRACE_MS = 90_000;
const CHECK_MS = 30_000;
/** This many failed checks in a row, and the tunnel starts again (a new link). */
const MAX_FAILS = 3;

/**
 * The share link (a Cloudflare quick tunnel), kept up by the API itself while it runs:
 * start.bat passes cloudflared's path in SHARE_TUNNEL_BIN. The tunnel is started, its
 * link read, written to share-link.txt (start.bat shows and copies it) and sent to the
 * staff WhatsApp group. It is checked every 30 seconds; when it stops answering or
 * cloudflared exits, it is started again, and the new link goes to the group too.
 */
@Injectable()
export class ShareLinkService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ShareLinkService.name);
  private readonly bin = process.env.SHARE_TUNNEL_BIN;
  private readonly target = process.env.SHARE_TUNNEL_TARGET || 'http://localhost:4173';
  private readonly file = resolve(process.cwd(), 'share-link.txt');
  private child: ChildProcess | null = null;
  private timer?: NodeJS.Timeout;
  private stopping = false;
  private startedAt = 0;
  private fails = 0;
  private restarts = 0;
  /** the link the group has not been told about yet */
  private unannounced: string | null = null;
  private announcedOnce = false;
  link: string | null = null;

  constructor(
    private readonly notifications: NotificationsService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || !this.bin) return;
    await rm(this.file, { force: true });
    this.start();
    this.timer = setInterval(() => void this.check(), CHECK_MS);
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.child?.kill();
  }

  private start() {
    this.link = null;
    this.fails = 0;
    this.startedAt = Date.now();
    // http2 over TCP: QUIC (UDP) drops on many networks
    const child = spawn(this.bin!, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', this.target], {
      windowsHide: true,
    });
    this.child = child;
    const read = (chunk: Buffer) => {
      const found = LINK.exec(chunk.toString())?.[0];
      if (found && !this.link && child === this.child) void this.found(found);
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    child.on('error', (e) => this.logger.error(`cloudflared could not start: ${e.message}`));
    child.on('exit', (code) => {
      if (this.stopping || child !== this.child) return;
      this.logger.warn(`The link stopped (cloudflared exited, code ${code}); starting it again`);
      this.again();
    });
  }

  /** Starts the tunnel again after a pause that grows while it keeps failing. */
  private again() {
    const old = this.child;
    this.child = null;
    old?.kill();
    this.link = null;
    const wait = Math.min(5_000 * 2 ** this.restarts, 60_000);
    this.restarts++;
    setTimeout(() => {
      if (!this.stopping) this.start();
    }, wait).unref();
  }

  private async found(link: string) {
    this.link = link;
    this.unannounced = link;
    this.logger.log(`Share link: ${link}`);
    await writeFile(this.file, link).catch((e: unknown) => this.logger.error(`Could not write ${this.file}: ${String(e)}`));
    await this.announce();
  }

  /** Tells the staff group the link: the day's first, or the new one after a drop. */
  private async announce() {
    const link = this.unannounced;
    if (!link || !this.whatsapp.ready) return;
    const group = await this.notifications.group();
    if (!group) return;
    const text = this.announcedOnce
      ? `🔗 رابط سيستم HAMMER LINE اتغيّر، الرابط الجديد:\n${link}`
      : `🔗 رابط سيستم HAMMER LINE:\n${link}`;
    try {
      await this.whatsapp.send(group.jid, text);
      if (this.unannounced === link) this.unannounced = null;
      this.announcedOnce = true;
    } catch (e) {
      this.logger.warn(`Could not send the link to WhatsApp yet: ${String(e)}`);
    }
  }

  /** Every 30 seconds: does the link still answer? */
  async check() {
    if (this.stopping || !this.child) return;
    await this.announce();
    const age = Date.now() - this.startedAt;
    if (!this.link) {
      if (age > GRACE_MS) {
        this.logger.warn('No link came up; starting the tunnel again');
        this.again();
      }
      return;
    }
    if (age < GRACE_MS) return;
    const ok = await fetch(`${this.link}/api/health`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.ok)
      .catch((e: { cause?: { code?: string } }) =>
        // this computer not finding the name yet (DNS) says nothing about the tunnel:
        // a dead tunnel still answers, with Cloudflare's error page
        ['ENOTFOUND', 'EAI_AGAIN'].includes(e.cause?.code ?? '') ? null : false,
      );
    if (ok === null) return;
    if (ok) {
      this.fails = 0;
      this.restarts = 0;
      return;
    }
    this.fails++;
    this.logger.warn(`The link did not answer (${this.fails}/${MAX_FAILS})`);
    if (this.fails >= MAX_FAILS) this.again();
  }
}
