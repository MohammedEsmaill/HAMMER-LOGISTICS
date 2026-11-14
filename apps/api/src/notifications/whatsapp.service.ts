import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import pino from 'pino';
import * as QRCode from 'qrcode';
import { AppConfig } from '../config/env.validation';

export type WhatsappState = 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED';

/** The few pieces of the Baileys socket used here. */
interface Socket {
  user?: { id: string; name?: string };
  ev: { on(event: string, listener: (arg: never) => void): void };
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  groupFetchAllParticipating(): Promise<
    Record<string, { id: string; subject: string; size?: number }>
  >;
  logout(): Promise<void>;
  end(error?: Error): void;
}

interface Baileys {
  default: (config: Record<string, unknown>) => Socket;
  useMultiFileAuthState(
    dir: string,
  ): Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
  fetchLatestBaileysVersion(): Promise<{ version: number[] }>;
  DisconnectReason: { loggedOut: number };
}

// Baileys is an ES module; the API is CommonJS, so it is loaded with a real import()
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importEsm = new Function('s', 'return import(s)') as (
  s: string,
) => Promise<Baileys>;

/**
 * The office WhatsApp number, linked like WhatsApp Web (a QR scanned from the phone).
 * Unofficial: use a number kept for the system only. The session is kept on disk, so
 * the link survives restarts; a logout from the phone unlinks it.
 */
@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly dir: string;
  private socket: Socket | null = null;
  private stopping = false;
  private retries = 0;
  state: WhatsappState = 'DISCONNECTED';
  qr: string | null = null;
  account: { id: string; name?: string } | null = null;

  constructor(config: ConfigService<AppConfig, true>) {
    const dir = config.get('WA_AUTH_DIR', { infer: true }) || 'whatsapp-auth';
    this.dir = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  onModuleInit() {
    // a number linked before connects again by itself; tests never connect
    if (process.env.NODE_ENV !== 'test' && existsSync(this.dir))
      void this.connect();
  }

  onModuleDestroy() {
    this.stopping = true;
    this.socket?.end();
  }

  /** Connects; a number not linked yet gets a QR to scan (state QR). */
  async connect(): Promise<void> {
    if (this.socket && this.state !== 'DISCONNECTED') return;
    this.state = 'CONNECTING';
    try {
      const baileys = await importEsm('baileys');
      const { state, saveCreds } = await baileys.useMultiFileAuthState(
        this.dir,
      );
      const { version } = await baileys.fetchLatestBaileysVersion();
      const socket = baileys.default({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ['HAMMER LINE', 'Chrome', '1.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      this.socket = socket;
      socket.ev.on('creds.update', () => void saveCreds());
      socket.ev.on(
        'connection.update',
        (u: {
          connection?: string;
          qr?: string;
          lastDisconnect?: { error?: { output?: { statusCode?: number } } };
        }) => {
          if (u.qr) {
            this.state = 'QR';
            void QRCode.toDataURL(u.qr, { margin: 1, width: 320 }).then(
              (url) => (this.qr = url),
            );
          }
          if (u.connection === 'open') {
            this.state = 'CONNECTED';
            this.qr = null;
            this.retries = 0;
            this.account = socket.user
              ? { id: socket.user.id, name: socket.user.name }
              : null;
            this.logger.log(`WhatsApp connected as ${this.account?.id ?? '?'}`);
          }
          if (u.connection === 'close') {
            // a QR nobody scanned in time: wait for the CEO to ask again
            const unscanned = this.state === 'QR';
            this.socket = null;
            this.state = 'DISCONNECTED';
            this.qr = null;
            const code = u.lastDisconnect?.error?.output?.statusCode;
            if (code === baileys.DisconnectReason.loggedOut) {
              this.logger.warn(
                'WhatsApp logged out from the phone; link it again',
              );
              this.account = null;
              void rm(this.dir, { recursive: true, force: true });
            } else if (!this.stopping && !unscanned) {
              // offline or dropped: try again, less often the longer it lasts
              this.retries++;
              const wait = Math.min(5000 * this.retries, 60_000);
              setTimeout(() => void this.connect(), wait);
            }
          }
        },
      );
    } catch (error) {
      this.state = 'DISCONNECTED';
      this.logger.error(`WhatsApp failed to start: ${String(error)}`);
    }
  }

  /** Unlinks the number and forgets the session. */
  async logout() {
    this.stopping = true;
    try {
      await this.socket?.logout();
    } catch {
      // already gone
    }
    this.socket?.end();
    this.socket = null;
    this.state = 'DISCONNECTED';
    this.qr = null;
    this.account = null;
    await rm(this.dir, { recursive: true, force: true });
    this.stopping = false;
  }

  /** The groups the linked number is in, to pick the staff group from. */
  async groups(): Promise<{ id: string; name: string; members: number }[]> {
    if (!this.socket || this.state !== 'CONNECTED') return [];
    const all = await this.socket.groupFetchAllParticipating();
    return Object.values(all)
      .map((g) => ({ id: g.id, name: g.subject, members: g.size ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  get ready() {
    return this.state === 'CONNECTED' && !!this.socket;
  }

  async send(jid: string, text: string) {
    if (!this.socket || this.state !== 'CONNECTED')
      throw new Error('واتساب غير متصل');
    await this.socket.sendMessage(jid, { text });
  }
}
