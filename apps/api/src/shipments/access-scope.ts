import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, can } from '../auth/auth-user';

/**
 * Row-level isolation: the shipments a user may see. Applied in every query, so a
 * shipment outside the scope reads as "not found" even when asked for by id.
 */
export function shipmentScope(user: AuthUser): Prisma.ShipmentWhereInput {
  if (can(user, 'shipments.view.all')) return {};
  if (can(user, 'shipments.view.own')) {
    if (user.accountType === 'CLEARER' && user.clearerId) {
      return { clearerId: user.clearerId };
    }
    if (user.accountType === 'EMPLOYEE' && user.employeeId) {
      return { operationEmployeeId: user.employeeId };
    }
  }
  throw new ForbiddenException('ليس لديك صلاحية لعرض الشحنات');
}
