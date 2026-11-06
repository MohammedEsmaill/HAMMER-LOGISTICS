import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthUser, can } from '../auth-user';
import {
  PERMISSIONS_KEY,
  PermissionRequirement,
} from '../decorators/permissions.decorator';

/** Global guard, runs after JwtAuthGuard: checks @RequirePermissions / @RequireAnyPermission. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<
      PermissionRequirement | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!requirement) return true;

    const user = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>().user;
    if (!user) return false;

    const check = (p: (typeof requirement.permissions)[number]) => can(user, p);
    const allowed =
      requirement.mode === 'all'
        ? requirement.permissions.every(check)
        : requirement.permissions.some(check);
    if (!allowed) throw new ForbiddenException('ليس لديك صلاحية لهذا الإجراء');
    return true;
  }
}
