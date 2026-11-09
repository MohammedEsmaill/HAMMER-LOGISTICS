import { BadRequestException, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id (the library's default) with the same cost as the hashes already stored,
 * which carry their own parameters, so old and new hashes both verify. @node-rs/argon2
 * ships a ready binary per platform: no compiler or Python needed on Windows.
 */
export const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4 };

@Injectable()
export class PasswordService {
  /** Verified against when the email is unknown, so a wrong email and a wrong password take the same time. */
  private readonly dummyHash = hash('timing-equaliser-not-a-password', ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    this.assertStrong(password);
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(stored: string | null, password: string): Promise<boolean> {
    try {
      return await verify(stored ?? (await this.dummyHash), password);
    } catch {
      return false;
    }
  }

  assertStrong(password: string): void {
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      throw new BadRequestException(
        'كلمة السر لازم تكون 8 حروف على الأقل وفيها حروف وأرقام',
      );
    }
  }
}
