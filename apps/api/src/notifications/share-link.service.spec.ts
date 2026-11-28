import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShareLinkService } from './share-link.service';

/** A stand-in for cloudflared: prints a new link each run; the first run exits after a moment. */

const until = async (ok: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
};
function fakeTunnel(dir: string) {
  const bin = join(dir, 'cloudflared');
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const n = Date.now().toString(36);
console.error('INF Requesting new quick Tunnel on trycloudflare.com...');
console.error('INF |  https://api.trycloudflare.com  |');
console.error('INF |  https://word-' + n + '.trycloudflare.com  |');
// the first run drops; the next ones stay up
const fs = require('fs');
const mark = __dirname + '/ran';
if (!fs.existsSync(mark)) { fs.writeFileSync(mark, '1'); setTimeout(() => process.exit(1), 1500); }
else setInterval(() => {}, 1000);
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

describe('ShareLinkService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('reads the link, writes it for start.bat, tells the group, and starts again when the tunnel exits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'share-'));
    process.env.SHARE_TUNNEL_BIN = fakeTunnel(dir);
    process.env.NODE_ENV = 'development';
    const cwd = process.cwd();
    process.chdir(dir);
    const sent: string[] = [];
    const service = new ShareLinkService(
      { group: () => Promise.resolve({ jid: 'g@g.us', name: 'staff' }) } as never,
      { ready: true, send: (_: string, text: string) => (sent.push(text), Promise.resolve()) } as never,
    );
    try {
      await service.onApplicationBootstrap();
      await until(() => !!service.link && sent.length > 0, 3_000);
      const first = service.link;
      expect(first).toMatch(/^https:\/\/word-[a-z0-9]+\.trycloudflare\.com$/);
      expect(readFileSync(join(dir, 'share-link.txt'), 'utf8')).toBe(first);
      expect(sent[0]).toContain(first);
      // it exits: started again after a pause, with a new link the group hears about
      await until(() => !!service.link && service.link !== first && sent.length > 1, 9_000);
      expect(service.link).toMatch(/trycloudflare\.com$/);
      expect(service.link).not.toBe(first);
      expect(sent.some((t) => t.includes('اتغيّر') && t.includes(service.link!))).toBe(true);
    } finally {
      service.onModuleDestroy();
      process.chdir(cwd);
    }
  }, 15_000);
});
