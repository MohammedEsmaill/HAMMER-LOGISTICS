import { randomBytes } from 'node:crypto';
import { blindIndex, decrypt, encrypt, isEncrypted, resetPersonalDataKey } from './personal-data';

describe('personal data encryption', () => {
  beforeAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    resetPersonalDataKey();
  });

  it('encrypts differently each time and decrypts back', () => {
    const a = encrypt('29001011234567');
    const b = encrypt('29001011234567');
    expect(a).not.toBe(b);
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toContain('29001011234567');
    expect(decrypt(a)).toBe('29001011234567');
  });

  it('gives the same hash for the same number, digits only', () => {
    expect(blindIndex('0100 000 0001')).toBe(blindIndex('01000000001'));
    expect(blindIndex('01000000001')).not.toBe(blindIndex('01000000002'));
  });

  it('reads a value from before encryption as it is', () => {
    expect(decrypt('01000000001')).toBe('01000000001');
  });

  it('refuses a tampered value', () => {
    const v = encrypt('01000000001');
    const bad = v.slice(0, -4) + (v.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => decrypt(bad)).toThrow();
  });
});
