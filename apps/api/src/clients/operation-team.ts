import { Direction, Prisma } from '@prisma/client';

/**
 * A client's operation team per direction: the operation employee (who the shipment is
 * registered on) and an optional reviewer, both from the OPERATION department. Export
 * uses the export pair when the client has an export operation employee, otherwise the
 * import pair.
 */

/** Clients whose shipments in `direction` the employee reviews. */
export function reviewerClientWhere(
  employeeId: number,
  direction: Direction,
): Prisma.ClientWhereInput {
  if (direction === 'IMPORT') return { importReviewerEmployeeId: employeeId };
  return {
    OR: [
      { exportReviewerEmployeeId: employeeId },
      { exportOperationEmployeeId: null, importReviewerEmployeeId: employeeId },
    ],
  };
}

/** Clients the employee is on the team of (operation employee or reviewer). */
export function operationClientWhere(
  employeeId: number,
  direction?: Direction,
): Prisma.ClientWhereInput {
  const imports: Prisma.ClientWhereInput = {
    OR: [
      { importOperationEmployeeId: employeeId },
      reviewerClientWhere(employeeId, 'IMPORT'),
    ],
  };
  const exports: Prisma.ClientWhereInput = {
    OR: [
      { exportOperationEmployeeId: employeeId },
      {
        exportOperationEmployeeId: null,
        importOperationEmployeeId: employeeId,
      },
      reviewerClientWhere(employeeId, 'EXPORT'),
    ],
  };
  if (direction === 'IMPORT') return imports;
  if (direction === 'EXPORT') return exports;
  return { OR: [imports, exports] };
}

export interface ClientTeamIds {
  importOperationEmployeeId: number;
  exportOperationEmployeeId: number | null;
  importReviewerEmployeeId: number | null;
  exportReviewerEmployeeId: number | null;
}

/** The operation employee and reviewer of one direction. */
export function teamFor(client: ClientTeamIds, direction: Direction) {
  if (direction === 'EXPORT' && client.exportOperationEmployeeId) {
    return {
      operation: client.exportOperationEmployeeId,
      reviewer: client.exportReviewerEmployeeId,
    };
  }
  return {
    operation: client.importOperationEmployeeId,
    reviewer: client.importReviewerEmployeeId,
  };
}
