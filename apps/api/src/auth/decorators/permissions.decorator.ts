import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';

export interface PermissionRequirement {
  mode: 'all' | 'any';
  permissions: Permission[];
}

/** The user must hold every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, {
    mode: 'all',
    permissions,
  } satisfies PermissionRequirement);

/** The user must hold at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, {
    mode: 'any',
    permissions,
  } satisfies PermissionRequirement);
