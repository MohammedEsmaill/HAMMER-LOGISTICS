import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type PgMode = 'local' | 'docker';

export interface PgTarget {
  mode: PgMode;
  /** local: the connection string without Prisma's query options. */
  url: string;
  user: string;
  database: string;
  composeFile: string;
}

/** Runs a command; stdout to a file and stdin from a file when given. */
export function run(
  cmd: string,
  args: string[],
  io: { stdinFile?: string; stdoutFile?: string; cwd?: string } = {},
): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, {
      cwd: io.cwd,
      // npx is a script on Windows
      shell: process.platform === 'win32' && cmd === 'npx',
      stdio: [io.stdinFile ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    let err = '';
    if (io.stdoutFile) child.stdout!.pipe(createWriteStream(io.stdoutFile));
    else child.stdout!.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr!.on('data', (d: Buffer) => (err += d.toString()));
    if (io.stdinFile && child.stdin)
      createReadStream(io.stdinFile).pipe(child.stdin);
    child.on('error', fail);
    child.on('close', (code) => {
      if (code === 0) done(out);
      else
        fail(
          new Error(
            err.trim().split('\n').slice(-3).join(' ') ||
              `${cmd} exited with ${code}`,
          ),
        );
    });
  });
}

/** pg_dump on this machine if it is there, otherwise inside the docker database. */
export async function pgTarget(
  databaseUrl: string,
  wanted: 'auto' | 'local' | 'docker',
  composeFile?: string,
): Promise<PgTarget> {
  const parsed = new URL(databaseUrl);
  const url = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}${parsed.pathname}`;
  const target = {
    url,
    user: decodeURIComponent(parsed.username),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    composeFile:
      composeFile ?? resolve(process.cwd(), '../../docker-compose.yml'),
  };
  if (wanted !== 'docker') {
    const local = await run('pg_dump', ['--version']).then(
      () => true,
      () => false,
    );
    if (local) return { ...target, mode: 'local' };
    if (wanted === 'local') throw new Error('pg_dump مش متسطب على الجهاز');
  }
  if (!existsSync(target.composeFile)) {
    throw new Error(`مش لاقي ملف docker compose: ${target.composeFile}`);
  }
  return { ...target, mode: 'docker' };
}

const docker = (t: PgTarget, tool: string, args: string[]) => [
  'compose',
  '-f',
  t.composeFile,
  'exec',
  '-T',
  'db',
  tool,
  '-U',
  t.user,
  ...args,
];

/** The whole database to one file (pg_dump custom format). */
export function dump(t: PgTarget, file: string) {
  const args = ['--format=custom', '--no-owner', '--no-privileges'];
  return t.mode === 'local'
    ? run('pg_dump', [...args, `--dbname=${t.url}`], { stdoutFile: file })
    : run('docker', docker(t, 'pg_dump', [...args, t.database]), {
        stdoutFile: file,
      });
}

/** Replaces the database with a backup, all or nothing. */
export function restore(t: PgTarget, file: string) {
  const args = [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--single-transaction',
    '--exit-on-error',
  ];
  return t.mode === 'local'
    ? run('pg_restore', [...args, `--dbname=${t.url}`, file])
    : run(
        'docker',
        docker(t, 'pg_restore', [...args, `--dbname=${t.database}`]),
        { stdinFile: file },
      );
}
