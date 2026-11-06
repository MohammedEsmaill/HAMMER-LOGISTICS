import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuthUser } from './auth-user';
import { ALL_PERMISSIONS, isPermission } from './permissions';

export const USER_WITH_OWNER = {
  role: true,
  employee: { select: { fullName: true, status: true, deletedAt: true } },
  clearer: { select: { fullName: true, isActive: true, deletedAt: true } },
} satisfies Prisma.UserInclude;

export type UserWithOwner = Prisma.UserGetPayload<{
  include: typeof USER_WITH_OWNER;
}>;

/**
 * One active session per user: users.session_id holds it, every token carries it,
 * and a new login, a logout, a password change or a deactivation replaces or clears it.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: number, sessionId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_WITH_OWNER,
    });
    if (!user || user.sessionId !== sessionId) {
      throw new UnauthorizedException(
        'الجلسة انتهت أو اتفتح حسابك من جهاز تاني',
      );
    }
    this.assertUsable(user);
    return this.toAuthUser(user);
  }

  /** Throws when the account, or the employee / clearer behind it, may not log in. */
  assertUsable(user: UserWithOwner): void {
    const ownerActive =
      user.accountType === 'EMPLOYEE'
        ? user.employee?.status === 'ACTIVE' && !user.employee.deletedAt
        : !!user.clearer?.isActive && !user.clearer.deletedAt;
    if (user.deletedAt || !user.isActive || !ownerActive) {
      throw new UnauthorizedException('الحساب ده موقوف');
    }
  }

  async open(userId: number, tx: Tx = this.prisma): Promise<string> {
    const sessionId = randomUUID();
    await tx.user.update({ where: { id: userId }, data: { sessionId } });
    return sessionId;
  }

  /** Swaps the session id only if it is still the current one, so a refresh token works once. */
  async rotate(userId: number, current: string): Promise<string> {
    const next = randomUUID();
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: userId,
        sessionId: current,
        isActive: true,
        deletedAt: null,
      },
      data: { sessionId: next },
    });
    if (count !== 1) {
      throw new UnauthorizedException('انتهت الجلسة، سجّل الدخول تاني');
    }
    return next;
  }

  async close(userId: number, tx: Tx = this.prisma): Promise<void> {
    await tx.user.update({ where: { id: userId }, data: { sessionId: null } });
  }

  toAuthUser(user: UserWithOwner): AuthUser {
    const permissions = user.role.isSystem
      ? ALL_PERMISSIONS
      : user.role.permissions.filter(isPermission);
    return {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      employeeId: user.employeeId,
      clearerId: user.clearerId,
      role: {
        id: user.role.id,
        name: user.role.name,
        isSystem: user.role.isSystem,
      },
      permissions: new Set(permissions),
    };
  }
}
