import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, can } from '../auth/auth-user';
import { reviewerClientWhere } from '../clients/operation-team';

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
      // their own shipments, and those of the clients they review
      const id = user.employeeId;
      return {
        OR: [
          { operationEmployeeId: id },
          { direction: 'IMPORT', client: reviewerClientWhere(id, 'IMPORT') },
          { direction: 'EXPORT', client: reviewerClientWhere(id, 'EXPORT') },
        ],
      };
    }
  }
  throw new ForbiddenException('ليس لديك صلاحية لعرض الشحنات');
}
