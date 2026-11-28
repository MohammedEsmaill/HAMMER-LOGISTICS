import { AccountType } from '@prisma/client';
import { HEAD_MANAGER_ROLE, Permission } from './permissions';

/** The authenticated user attached to every request by JwtAuthGuard. */
export interface AuthUser {
  id: number;
  email: string;
  accountType: AccountType;
  employeeId: number | null;
  clearerId: number | null;
  /** The main role; isSystem when any of the user's roles is the CEO's. */
  role: { id: number; name: string; isSystem: boolean };
  /** The names of all the user's roles, the main one first. */
  roles: string[];
  permissions: ReadonlySet<Permission>;
}

/** The CEO or the head manager: the CEO's own actions outside approving and roles. */
export function isTopManager(user: AuthUser): boolean {
  return user.role.isSystem || user.roles.includes(HEAD_MANAGER_ROLE);
}

export function can(user: AuthUser, permission: Permission): boolean {
  return user.role.isSystem || user.permissions.has(permission);
}
