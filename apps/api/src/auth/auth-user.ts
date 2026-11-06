import { AccountType } from '@prisma/client';
import { Permission } from './permissions';

/** The authenticated user attached to every request by JwtAuthGuard. */
export interface AuthUser {
  id: number;
  email: string;
  accountType: AccountType;
  employeeId: number | null;
  clearerId: number | null;
  role: { id: number; name: string; isSystem: boolean };
  permissions: ReadonlySet<Permission>;
}

export function can(user: AuthUser, permission: Permission): boolean {
  return user.role.isSystem || user.permissions.has(permission);
}
