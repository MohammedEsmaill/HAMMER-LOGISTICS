-- CreateTable
CREATE TABLE "factory_item_prices" (
    "factory_id" INTEGER NOT NULL,
    "settlement_item_id" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factory_item_prices_pkey" PRIMARY KEY ("factory_id","settlement_item_id")
);

-- CreateIndex
CREATE INDEX "factory_item_prices_settlement_item_id_idx" ON "factory_item_prices"("settlement_item_id");

-- AddForeignKey
ALTER TABLE "factory_item_prices" ADD CONSTRAINT "factory_item_prices_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory_item_prices" ADD CONSTRAINT "factory_item_prices_settlement_item_id_fkey" FOREIGN KEY ("settlement_item_id") REFERENCES "settlement_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── checks the schema cannot say ─────────
ALTER TABLE "factory_item_prices"
  ADD CONSTRAINT "factory_item_prices_price" CHECK ("price" >= 0);

-- every factory starts with every item at today's default price
INSERT INTO "factory_item_prices" ("factory_id", "settlement_item_id", "price", "updated_at")
SELECT f."id", i."id", i."price", now()
  FROM "factories" f CROSS JOIN "settlement_items" i
 WHERE f."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
