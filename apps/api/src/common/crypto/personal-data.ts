import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * National IDs and phone numbers are kept encrypted (AES-256-GCM): whoever gets the
 * database or a backup cannot read them; the system decrypts them to show them. Each
 * also has a keyed hash (HMAC-SHA256) that is the same for the same number, so the
 * database can keep them unique and the system can find an exact number.
 *
 * The key is FIELD_ENCRYPTION_KEY (32 random bytes, base64) in the .env: lose it and
 * these numbers cannot be read back.
 */
const PREFIX = 'enc:v1:';

let keys: { enc: Buffer; mac: Buffer } | null = null;

function load() {
  if (keys) return keys;
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  const master = raw ? Buffer.from(raw, 'base64') : null;
  if (!master || master.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY is missing or not 32 bytes of base64');
  }
  keys = {
    enc: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'hammer:field-encryption', 32)),
    mac: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'hammer:blind-index', 32)),
  };
  return keys;
}

/** For tests: forget the loaded key. */
export function resetPersonalDataKey() {
  keys = null;
}

export const isEncrypted = (value: string) => value.startsWith(PREFIX);

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', load().enc, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** The plain number; a value still stored in plain text (from before) comes back as it is. */
export function decrypt(value: string): string;
export function decrypt(value: string | null): string | null;
export function decrypt(value: string | null): string | null {
  if (value === null || !isEncrypted(value)) return value;
  const data = Buffer.from(value.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', load().enc, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}

/** The same number always gives the same hash (digits only, so spaces do not count). */
export function blindIndex(value: string): string {
  const digits = value.replace(/\D/g, '');
  return createHmac('sha256', load().mac).update(digits).digest('hex');
}

/** The hash of a number; an empty one has none (it is no one's number). */
export const hashOf = (value: string) => (value.replace(/\D/g, '') ? blindIndex(value) : null);

/** What is stored for a national ID and a phone: each encrypted, with its hash. */
export function sealContact(input: { nationalId?: string; phone?: string }) {
  return {
    ...(input.nationalId !== undefined
      ? { nationalId: encrypt(input.nationalId), nationalIdHash: hashOf(input.nationalId) }
      : {}),
    ...(input.phone !== undefined ? { phone: encrypt(input.phone), phoneHash: hashOf(input.phone) } : {}),
  };
}

/** Shown in place of a number the key cannot open (a different FIELD_ENCRYPTION_KEY). */
export const UNREADABLE = 'مفتاح التشفير مش مطابق';
let warned = false;

/** Decrypts, or says the key does not match, without breaking the whole page. */
function readable(value: string): string {
  try {
    return decrypt(value);
  } catch {
    if (!warned) {
      warned = true;
      console.error('FIELD_ENCRYPTION_KEY does not open the stored national IDs / phones: is it the key they were saved with?');
    }
    return UNREADABLE;
  }
}

/** A row with its national ID and phone readable again. */
export function openContact<T extends { nationalId?: string; phone?: string }>(row: T): T {
  return {
    ...row,
    ...(row.nationalId !== undefined ? { nationalId: readable(row.nationalId) } : {}),
    ...(row.phone !== undefined ? { phone: readable(row.phone) } : {}),
  };
}
