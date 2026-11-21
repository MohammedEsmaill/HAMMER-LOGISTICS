import { Prisma } from '@prisma/client';
import { Tx } from '../prisma/prisma.service';

/**
 * Gives factories every clearer settlement item at its default price (rows already
 * there are kept). Called when a factory or an item is added.
 */
export async function seedFactoryPrices(
  tx: Tx,
  where: { factoryIds?: number[]; itemId?: number },
) {
  const factories = where.factoryIds
    ? Prisma.sql`f."id" IN (${Prisma.join(where.factoryIds)})`
    : Prisma.sql`f."deleted_at" IS NULL`;
  const items = where.itemId
    ? Prisma.sql`i."id" = ${where.itemId}`
    : Prisma.sql`TRUE`;
  await tx.$executeRaw`
    INSERT INTO "factory_item_prices" ("factory_id", "settlement_item_id", "price", "updated_at")
    SELECT f."id", i."id", i."price", now()
      FROM "factories" f CROSS JOIN "settlement_items" i
     WHERE ${factories} AND ${items}
    ON CONFLICT DO NOTHING`;
}

/** The price of each item for a factory: its own, or the item's default when it has none. */
export async function factoryItemPrices(
  db: Pick<Tx, 'settlementItem'>,
  factoryId: number,
  ids?: number[],
) {
  const items = await db.settlementItem.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    include: { factoryPrices: { where: { factoryId } } },
  });
  return new Map(
    items.map((i) => [i.id, i.factoryPrices[0]?.price ?? i.price] as const),
  );
}
