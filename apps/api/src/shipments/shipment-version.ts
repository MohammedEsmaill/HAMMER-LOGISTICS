import { ConflictException } from '@nestjs/common';
import { Tx } from '../prisma/prisma.service';

/**
 * Optimistic locking: bumps the version only if it is still the one the user edited.
 * The row stays locked until the transaction ends, so two edits cannot both pass.
 */
export async function claimVersion(
  tx: Tx,
  shipmentId: number,
  version: number,
): Promise<void> {
  const { count } = await tx.shipment.updateMany({
    where: { id: shipmentId, version },
    data: { version: { increment: 1 } },
  });
  if (count !== 1) {
    throw new ConflictException(
      'الشحنة اتعدلت من شخص تاني بعد ما فتحتها، حدّث الصفحة وعدّل تاني',
    );
  }
}
