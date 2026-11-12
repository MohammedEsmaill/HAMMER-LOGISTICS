-- AlterTable
ALTER TABLE "custody_items" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "settlement_item_id" INTEGER;

-- CreateTable
CREATE TABLE "clearer_fee_rates" (
    "regime" "CustomsRegime" NOT NULL,
    "first_container" DECIMAL(14,2) NOT NULL,
    "extra_container" DECIMAL(14,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clearer_fee_rates_pkey" PRIMARY KEY ("regime")
);

-- CreateTable
CREATE TABLE "settlement_items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "per_container" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "expense_type_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settlement_items_name_key" ON "settlement_items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_items_expense_type_id_key" ON "settlement_items"("expense_type_id");

-- AddForeignKey
ALTER TABLE "custody_items" ADD CONSTRAINT "custody_items_settlement_item_id_fkey" FOREIGN KEY ("settlement_item_id") REFERENCES "settlement_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_expense_type_id_fkey" FOREIGN KEY ("expense_type_id") REFERENCES "expense_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules
ALTER TABLE "clearer_fee_rates"
  ADD CONSTRAINT "clearer_fee_rates_positive" CHECK ("first_container" > 0 AND "extra_container" >= 0);
ALTER TABLE "settlement_items"
  ADD CONSTRAINT "settlement_items_price_positive" CHECK ("price" > 0);
ALTER TABLE "custody_items"
  ADD CONSTRAINT "custody_items_quantity_positive" CHECK ("quantity" >= 1);

-- The prices agreed with the office (the CEO changes them from the lookups screen)
INSERT INTO "clearer_fee_rates" ("regime", "first_container", "extra_container", "updated_at") VALUES
  ('TEMPORARY', 2600, 700, now()),
  ('FINAL', 3000, 700, now());

INSERT INTO "expense_types" ("name", "scope") VALUES
  ('عرض الزراعة', 'SHIPMENT'),
  ('عرض الكيماويات', 'SHIPMENT'),
  ('عرض الحماية المدنية', 'SHIPMENT'),
  ('عرض أمن عام', 'SHIPMENT'),
  ('عرض واردات', 'SHIPMENT'),
  ('عرض طاقة ذرية', 'SHIPMENT'),
  ('عرض مخدرات', 'SHIPMENT'),
  ('مصاريف وزن الحاوية أثناء السير في الإجراءات', 'SHIPMENT')
ON CONFLICT ("scope", "name") DO NOTHING;

INSERT INTO "settlement_items" ("name", "price", "per_container", "sort_order", "expense_type_id", "updated_at")
SELECT v.name, v.price, v.per_container, v.sort_order, t."id", now()
  FROM (VALUES
    ('عرض الزراعة', 200, false, 1),
    ('عرض الكيماويات', 300, false, 2),
    ('عرض الحماية المدنية', 500, false, 3),
    ('عرض أمن عام', 1000, false, 4),
    ('عرض واردات', 500, false, 5),
    ('عرض طاقة ذرية', 400, false, 6),
    ('عرض مخدرات', 500, false, 7),
    ('مصاريف وزن الحاوية أثناء السير في الإجراءات', 2500, true, 8)
  ) AS v(name, price, per_container, sort_order)
  JOIN "expense_types" t ON t."scope" = 'SHIPMENT' AND t."name" = v.name;
