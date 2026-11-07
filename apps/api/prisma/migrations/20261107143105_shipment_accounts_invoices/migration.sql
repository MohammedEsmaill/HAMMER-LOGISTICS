-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('PAYMENT_RECEIPT', 'PAYMENT', 'VAT');

-- CreateEnum
CREATE TYPE "ShipmentAccountStatus" AS ENUM ('OPEN', 'FINISHED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('STATEMENT', 'CLEARANCE');

-- CreateEnum
CREATE TYPE "CollectionMethod" AS ENUM ('CASH', 'TRANSFER');

-- AlterEnum
ALTER TYPE "MovementSource" ADD VALUE 'COLLECTION';

-- AlterTable
ALTER TABLE "custody_items" ADD COLUMN     "receipt_kind" "ReceiptKind";

-- AlterTable
ALTER TABLE "money_movements" ADD COLUMN     "collection_id" INTEGER;

-- CreateTable
CREATE TABLE "shipment_accounts" (
    "shipment_id" INTEGER NOT NULL,
    "status" "ShipmentAccountStatus" NOT NULL DEFAULT 'OPEN',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "finished_at" TIMESTAMP(3),
    "finished_by" INTEGER,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_accounts_pkey" PRIMARY KEY ("shipment_id")
);

-- CreateTable
CREATE TABLE "statement_overrides" (
    "custody_item_id" INTEGER NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "amount" DECIMAL(14,2),
    "updated_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statement_overrides_pkey" PRIMARY KEY ("custody_item_id")
);

-- CreateTable
CREATE TABLE "statement_extra_lines" (
    "id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_extra_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "currency" "Currency" NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "invoice_date" DATE NOT NULL,
    "value_date" DATE,
    "customer_ref" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wht" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by" INTEGER,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "manager_by" INTEGER,
    "manager_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "rejected_by" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "custody_item_id" INTEGER,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "CollectionMethod" NOT NULL,
    "account_id" INTEGER NOT NULL,
    "collection_date" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "manager_by" INTEGER,
    "manager_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "rejected_by" INTEGER,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "statement_extra_lines_shipment_id_idx" ON "statement_extra_lines"("shipment_id");

-- CreateIndex
CREATE INDEX "invoices_shipment_id_idx" ON "invoices"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_line_no_key" ON "invoice_lines"("invoice_id", "line_no");

-- CreateIndex
CREATE INDEX "collections_client_id_idx" ON "collections"("client_id");

-- CreateIndex
CREATE INDEX "collections_shipment_id_idx" ON "collections"("shipment_id");

-- CreateIndex
CREATE INDEX "money_movements_collection_id_idx" ON "money_movements"("collection_id");

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_accounts" ADD CONSTRAINT "shipment_accounts_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_accounts" ADD CONSTRAINT "shipment_accounts_finished_by_fkey" FOREIGN KEY ("finished_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_overrides" ADD CONSTRAINT "statement_overrides_custody_item_id_fkey" FOREIGN KEY ("custody_item_id") REFERENCES "custody_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_overrides" ADD CONSTRAINT "statement_overrides_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_extra_lines" ADD CONSTRAINT "statement_extra_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_extra_lines" ADD CONSTRAINT "statement_extra_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_account_id_currency_fkey" FOREIGN KEY ("account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Business rules Prisma cannot express ─────

-- receipts like 861-26 / 00663-26, with the kind of document they stand for
UPDATE "custody_items" SET "receipt_kind" = 'PAYMENT_RECEIPT' WHERE "receipt_no" IS NOT NULL;
ALTER TABLE "custody_items" DROP CONSTRAINT "custody_items_receipt_digits";
ALTER TABLE "custody_items"
  ADD CONSTRAINT "custody_items_receipt_format" CHECK (
    "receipt_no" IS NULL OR ("receipt_no" ~ '^[0-9]+(-[0-9]+)*$' AND length("receipt_no") <= 30)),
  ADD CONSTRAINT "custody_items_receipt_kind" CHECK (("receipt_kind" IS NULL) = ("receipt_no" IS NULL));

ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source_fk";
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source_fk" CHECK (
  num_nonnulls("transfer_id", "other_movement_id", "salary_id", "advance_id", "expense_id",
               "custody_id", "fee_payment_id", "collection_id") = 1
  AND (("source"::text = 'TRANSFER') = ("transfer_id" IS NOT NULL))
  AND (("source"::text = 'OTHER') = ("other_movement_id" IS NOT NULL))
  AND (("source"::text = 'SALARY') = ("salary_id" IS NOT NULL))
  AND (("source"::text = 'ADVANCE') = ("advance_id" IS NOT NULL))
  AND (("source"::text = 'EXPENSE') = ("expense_id" IS NOT NULL))
  AND (("source"::text = 'CUSTODY') = ("custody_id" IS NOT NULL))
  AND (("source"::text = 'FEE_PAYMENT') = ("fee_payment_id" IS NOT NULL))
  AND (("source"::text = 'COLLECTION') = ("collection_id" IS NOT NULL)));

ALTER TABLE "statement_overrides"
  ADD CONSTRAINT "statement_overrides_amount" CHECK ("amount" IS NULL OR "amount" > 0);
ALTER TABLE "statement_extra_lines"
  ADD CONSTRAINT "statement_extra_lines_amount" CHECK ("amount" > 0),
  ADD CONSTRAINT "statement_extra_lines_description" CHECK (length(btrim("description")) >= 2);

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_amounts" CHECK (
    "subtotal" >= 0 AND "vat_rate" >= 0 AND "vat_amount" >= 0 AND "wht" >= 0
    AND "total" = "subtotal" + "vat_amount" - "wht"),
  ADD CONSTRAINT "invoices_clearance_egp" CHECK ("type" <> 'CLEARANCE' OR "currency" = 'EGP'),
  ADD CONSTRAINT "invoices_statement_no_vat" CHECK ("type" <> 'STATEMENT' OR ("vat_rate" = 0 AND "wht" = 0)),
  ADD CONSTRAINT "invoices_voided" CHECK (("voided_at" IS NULL) = ("voided_by" IS NULL)),
  ADD CONSTRAINT "invoices_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);
-- one live invoice of each type and currency per shipment; CLEARANCE numbers unique per cycle
CREATE UNIQUE INDEX "invoices_one_live" ON "invoices" ("shipment_id", "type", "currency") WHERE "voided_at" IS NULL;
CREATE UNIQUE INDEX "invoices_clearance_no" ON "invoices" ("invoice_no", "cycle")
  WHERE "type" = 'CLEARANCE' AND "voided_at" IS NULL;

ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_amounts" CHECK (
    "quantity" > 0 AND "unit_price" >= 0 AND "total" = round("quantity" * "unit_price", 2));

ALTER TABLE "collections"
  ADD CONSTRAINT "collections_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "collections_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

CREATE OR REPLACE VIEW "financial_operations_v" AS
  SELECT 'TRANSFER'::text AS "type", t."id", t."currency"::text AS "currency", t."amount",
         t."transfer_date" AS "operation_date", t."approval_status"::text AS "approval_status",
         t."created_by", t."created_at", t."version", t."rejection_reason"
    FROM "transfers" t
  UNION ALL
  SELECT 'OTHER', o."id", a."currency"::text, o."amount", o."movement_date", o."approval_status"::text,
         o."created_by", o."created_at", o."version", o."rejection_reason"
    FROM "other_movements" o JOIN "money_accounts" a ON a."id" = o."account_id"
  UNION ALL
  SELECT 'SALARY', s."id", s."currency"::text, s."net", s."payment_date", s."approval_status"::text,
         s."created_by", s."created_at", s."version", s."rejection_reason"
    FROM "salary_payments" s
  UNION ALL
  SELECT 'ADVANCE', v."id", v."currency"::text, v."amount", v."advance_date", v."approval_status"::text,
         v."created_by", v."created_at", v."version", v."rejection_reason"
    FROM "employee_advances" v
  UNION ALL
  SELECT 'EXPENSE', e."id", e."currency"::text, e."amount", e."expense_date", e."approval_status"::text,
         e."created_by", e."created_at", e."version", e."rejection_reason"
    FROM "general_expenses" e
  UNION ALL
  SELECT 'CUSTODY', c."id", c."currency"::text, c."spent_amount", c."settlement_date", c."approval_status"::text,
         c."created_by", c."created_at", c."version", c."rejection_reason"
    FROM "custodies" c WHERE c."status" = 'SETTLED'
  UNION ALL
  SELECT 'FEE_ADJUSTMENT', a."id", 'EGP', abs(a."amount")::numeric(14,2), a."adjustment_date", a."approval_status"::text,
         a."created_by", a."created_at", a."version", a."rejection_reason"
    FROM "clearer_fee_adjustments" a
  UNION ALL
  SELECT 'FEE_PAYMENT', p."id", p."currency"::text, p."amount", p."payment_date", p."approval_status"::text,
         p."created_by", p."created_at", p."version", p."rejection_reason"
    FROM "clearer_fee_payments" p
  UNION ALL
  SELECT 'INVOICE', i."id", i."currency"::text, i."total", i."invoice_date", i."approval_status"::text,
         i."created_by", i."created_at", i."version", i."rejection_reason"
    FROM "invoices" i WHERE i."voided_at" IS NULL
  UNION ALL
  SELECT 'COLLECTION', c."id", c."currency"::text, c."amount", c."collection_date", c."approval_status"::text,
         c."created_by", c."created_at", c."version", c."rejection_reason"
    FROM "collections" c;
