import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './auth-user';
import { PasswordService } from './password.service';
import { SessionService, USER_WITH_OWNER } from './session.service';
import { TokenService } from './token.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Profile {
  id: number;
  email: string;
  name: string;
  accountType: AuthUser['accountType'];
  role: { id: number; name: string };
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ip?: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
      include: USER_WITH_OWNER,
    });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60_000,
      );
      throw new UnauthorizedException(
        `الحساب مقفول مؤقتًا بسبب محاولات غلط كتير، حاول بعد ${minutes} دقيقة`,
      );
    }

    const valid = await this.passwords.verify(
      user?.passwordHash ?? null,
      password,
    );
    if (!user || !valid) {
      if (user) await this.recordFailure(user.id, user.failedAttempts);
      throw new UnauthorizedException('الإيميل أو كلمة السر غير صحيحة');
    }
    this.sessions.assertUsable(user);

    const sessionId = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      const sid = await this.sessions.open(user.id, tx);
      await this.audit.log(
        {
          userId: user.id,
          action: 'LOGIN',
          entity: 'user',
          entityId: user.id,
          ip,
        },
        tx,
      );
      return sid;
    });

    return {
      ...(await this.issue(user.id, sessionId)),
      profile: this.profile(this.sessions.toAuthUser(user), user),
    };
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException('سجّل الدخول الأول');
    const { sub, sid } = await this.tokens.verifyRefresh(refreshToken);
    await this.sessions.resolve(sub, sid); // account still usable
    const next = await this.sessions.rotate(sub, sid);
    return this.issue(sub, next);
  }

  async logout(user: AuthUser, ip?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.sessions.close(user.id, tx);
      await this.audit.log(
        {
          userId: user.id,
          action: 'LOGOUT',
          entity: 'user',
          entityId: user.id,
          ip,
        },
        tx,
      );
    });
  }

  /** Changing the password ends the session; the user logs in again with the new one. */
  async changePassword(
    user: AuthUser,
    currentPassword: string,
    newPassword: string,
    ip?: string,
  ): Promise<void> {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    if (!(await this.passwords.verify(record.passwordHash, currentPassword))) {
      throw new BadRequestException('كلمة السر الحالية غير صحيحة');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('كلمة السر الجديدة لازم تختلف عن الحالية');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, sessionId: null },
      });
      await this.audit.log(
        {
          userId: user.id,
          action: 'PASSWORD_CHANGE',
          entity: 'user',
          entityId: user.id,
          ip,
        },
        tx,
      );
    });
  }

  async me(user: AuthUser): Promise<Profile> {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: USER_WITH_OWNER,
    });
    return this.profile(user, record);
  }

  private async issue(userId: number, sid: string): Promise<IssuedTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccess({ sub: userId, sid }),
      this.tokens.signRefresh({ sub: userId, sid }),
    ]);
    return { accessToken, refreshToken };
  }

  private async recordFailure(userId: number, previous: number): Promise<void> {
    const attempts = previous + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: userId },
      data: lock
        ? {
            failedAttempts: 0,
            lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
          }
        : { failedAttempts: { increment: 1 } },
    });
  }

  private profile(
    user: AuthUser,
    record: {
      employee: { fullName: string } | null;
      clearer: { fullName: string } | null;
    },
  ): Profile {
    return {
      id: user.id,
      email: user.email,
      name: record.employee?.fullName ?? record.clearer?.fullName ?? user.email,
      accountType: user.accountType,
      role: { id: user.role.id, name: user.role.name },
      permissions: [...user.permissions],
    };
  }
}
