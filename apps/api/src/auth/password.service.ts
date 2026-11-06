import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  /** Verified against when the email is unknown, so a wrong email and a wrong password take the same time. */
  private readonly dummyHash = argon2.hash('timing-equaliser-not-a-password');

  hash(password: string): Promise<string> {
    this.assertStrong(password);
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash ?? (await this.dummyHash), password);
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
