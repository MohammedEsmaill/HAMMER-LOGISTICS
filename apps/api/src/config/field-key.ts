import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The key that encrypts national IDs and phones (FIELD_ENCRYPTION_KEY). On a computer
 * whose .env has none (the first start after the update), one is made and added to the
 * .env, so the system starts. Imported first in main.ts, before the config is read.
 */
function ensureFieldKey() {
  if (process.env.NODE_ENV === 'test' || process.env.FIELD_ENCRYPTION_KEY) return;
  const file = resolve(process.cwd(), '.env');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/^\s*FIELD_ENCRYPTION_KEY\s*=/m.test(text)) return;
  const key = randomBytes(32).toString('base64');
  appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}FIELD_ENCRYPTION_KEY="${key}"\n`);
  console.warn(
    `A new FIELD_ENCRYPTION_KEY was added to ${file}. Keep a copy of that line somewhere safe, ` +
      'away from this computer and its backups: without it the national IDs and phones cannot be read.',
  );
}

ensureFieldKey();
