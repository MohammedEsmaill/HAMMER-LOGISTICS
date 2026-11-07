-- CreateEnum
CREATE TYPE "CustodyHolder" AS ENUM ('AGENT', 'WAY_OUT', 'CLEARER', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "CustodyPurpose" AS ENUM ('UNLOADING', 'RELEASE', 'STORAGE', 'CLEARANCE');

-- CreateEnum
CREATE TYPE "CustodyStatus" AS ENUM ('OPEN', 'SETTLED');

-- CreateEnum
CREATE TYPE "FeeAdjustmentReason" AS ENUM ('CONTAINERS_CHANGED', 'CEO_OVERRIDE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementSource" ADD VALUE 'CUSTODY';
ALTER TYPE "MovementSource" ADD VALUE 'FEE_PAYMENT';

-- AlterTable
ALTER TABLE "money_movements" ADD COLUMN     "custody_id" INTEGER,
ADD COLUMN     "fee_payment_id" INTEGER;

-- CreateTable
CREATE TABLE "custodies" (
    "id" SERIAL NOT NULL,
    "custody_no" TEXT NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "holder_type" "CustodyHolder" NOT NULL,
    "agent_employee_id" INTEGER,
    "clearer_id" INTEGER,
    "purpose" "CustodyPurpose",
    "source_account_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "extra_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "spent_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returned_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "CustodyStatus" NOT NULL DEFAULT 'OPEN',
    "issue_date" DATE NOT NULL,
    "settlement_date" DATE,
    "settled_by" INTEGER,
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

    CONSTRAINT "custodies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_items" (
    "id" SERIAL NOT NULL,
    "custody_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "expense_type_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receipt_no" TEXT,
    "description" TEXT,

    CONSTRAINT "custody_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearer_fees" (
    "id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "clearer_id" INTEGER NOT NULL,
    "custody_id" INTEGER NOT NULL,
    "base" DECIMAL(14,2) NOT NULL,
    "extra_rate" DECIMAL(14,2) NOT NULL,
    "containers_count" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "computed_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clearer_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearer_fee_adjustments" (
    "id" SERIAL NOT NULL,
    "fee_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" "FeeAdjustmentReason" NOT NULL,
    "containers_from" INTEGER,
    "containers_to" INTEGER,
    "notes" TEXT,
    "adjustment_date" DATE NOT NULL,
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

    CONSTRAINT "clearer_fee_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearer_fee_payments" (
    "id" SERIAL NOT NULL,
    "fee_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "payment_date" DATE NOT NULL,
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

    CONSTRAINT "clearer_fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custodies_custody_no_key" ON "custodies"("custody_no");

-- CreateIndex
CREATE INDEX "custodies_shipment_id_idx" ON "custodies"("shipment_id");

-- CreateIndex
CREATE INDEX "custodies_clearer_id_idx" ON "custodies"("clearer_id");

-- CreateIndex
CREATE INDEX "custodies_agent_employee_id_idx" ON "custodies"("agent_employee_id");

-- CreateIndex
CREATE INDEX "custodies_status_approval_status_idx" ON "custodies"("status", "approval_status");

-- CreateIndex
CREATE INDEX "custody_items_receipt_no_idx" ON "custody_items"("receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "custody_items_custody_id_line_no_key" ON "custody_items"("custody_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "clearer_fees_shipment_id_key" ON "clearer_fees"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "clearer_fees_custody_id_key" ON "clearer_fees"("custody_id");

-- CreateIndex
CREATE INDEX "clearer_fees_clearer_id_idx" ON "clearer_fees"("clearer_id");

-- CreateIndex
CREATE INDEX "clearer_fee_adjustments_fee_id_idx" ON "clearer_fee_adjustments"("fee_id");

-- CreateIndex
CREATE INDEX "clearer_fee_payments_fee_id_idx" ON "clearer_fee_payments"("fee_id");

-- CreateIndex
CREATE INDEX "money_movements_custody_id_idx" ON "money_movements"("custody_id");

-- CreateIndex
CREATE INDEX "money_movements_fee_payment_id_idx" ON "money_movements"("fee_payment_id");

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_custody_id_fkey" FOREIGN KEY ("custody_id") REFERENCES "custodies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_fee_payment_id_fkey" FOREIGN KEY ("fee_payment_id") REFERENCES "clearer_fee_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_agent_employee_id_fkey" FOREIGN KEY ("agent_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_clearer_id_fkey" FOREIGN KEY ("clearer_id") REFERENCES "clearers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_source_account_id_currency_fkey" FOREIGN KEY ("source_account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_items" ADD CONSTRAINT "custody_items_custody_id_fkey" FOREIGN KEY ("custody_id") REFERENCES "custodies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_items" ADD CONSTRAINT "custody_items_expense_type_id_fkey" FOREIGN KEY ("expense_type_id") REFERENCES "expense_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fees" ADD CONSTRAINT "clearer_fees_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fees" ADD CONSTRAINT "clearer_fees_clearer_id_fkey" FOREIGN KEY ("clearer_id") REFERENCES "clearers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fees" ADD CONSTRAINT "clearer_fees_custody_id_fkey" FOREIGN KEY ("custody_id") REFERENCES "custodies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fees" ADD CONSTRAINT "clearer_fees_computed_by_fkey" FOREIGN KEY ("computed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_adjustments" ADD CONSTRAINT "clearer_fee_adjustments_fee_id_fkey" FOREIGN KEY ("fee_id") REFERENCES "clearer_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_adjustments" ADD CONSTRAINT "clearer_fee_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_adjustments" ADD CONSTRAINT "clearer_fee_adjustments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_adjustments" ADD CONSTRAINT "clearer_fee_adjustments_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_adjustments" ADD CONSTRAINT "clearer_fee_adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_adjustments" ADD CONSTRAINT "clearer_fee_adjustments_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_payments" ADD CONSTRAINT "clearer_fee_payments_fee_id_fkey" FOREIGN KEY ("fee_id") REFERENCES "clearer_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_payments" ADD CONSTRAINT "clearer_fee_payments_account_id_currency_fkey" FOREIGN KEY ("account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_payments" ADD CONSTRAINT "clearer_fee_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_payments" ADD CONSTRAINT "clearer_fee_payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_payments" ADD CONSTRAINT "clearer_fee_payments_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_payments" ADD CONSTRAINT "clearer_fee_payments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_payments" ADD CONSTRAINT "clearer_fee_payments_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Business rules Prisma cannot express ─────

ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source_fk";
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source_fk" CHECK (
  num_nonnulls("transfer_id", "other_movement_id", "salary_id", "advance_id", "expense_id",
               "custody_id", "fee_payment_id") = 1
  AND (("source"::text = 'TRANSFER') = ("transfer_id" IS NOT NULL))
  AND (("source"::text = 'OTHER') = ("other_movement_id" IS NOT NULL))
  AND (("source"::text = 'SALARY') = ("salary_id" IS NOT NULL))
  AND (("source"::text = 'ADVANCE') = ("advance_id" IS NOT NULL))
  AND (("source"::text = 'EXPENSE') = ("expense_id" IS NOT NULL))
  AND (("source"::text = 'CUSTODY') = ("custody_id" IS NOT NULL))
  AND (("source"::text = 'FEE_PAYMENT') = ("fee_payment_id" IS NOT NULL)));

-- each holder type: who holds it, what for, from which currency (spec section 11)
ALTER TABLE "custodies"
  ADD CONSTRAINT "custodies_amounts" CHECK (
    "amount" > 0 AND "extra_amount" >= 0 AND "spent_amount" >= 0 AND "returned_amount" >= 0),
  ADD CONSTRAINT "custodies_holder" CHECK (
    ("holder_type" = 'AGENT' AND "agent_employee_id" IS NOT NULL AND "clearer_id" IS NULL
       AND "purpose" IN ('UNLOADING', 'RELEASE', 'STORAGE') AND "currency" = 'EGP')
    OR ("holder_type" = 'WAY_OUT' AND "agent_employee_id" IS NULL AND "clearer_id" IS NULL
       AND "purpose" IN ('UNLOADING', 'RELEASE', 'STORAGE') AND "currency" = 'USD')
    OR ("holder_type" = 'CLEARER' AND "clearer_id" IS NOT NULL AND "agent_employee_id" IS NULL
       AND "purpose" IN ('CLEARANCE', 'RELEASE') AND "currency" = 'EGP')
    OR ("holder_type" = 'BANK_TRANSFER' AND "agent_employee_id" IS NULL AND "clearer_id" IS NULL
       AND "purpose" IS NULL)),
  ADD CONSTRAINT "custodies_extra_clearer_only" CHECK ("extra_amount" = 0 OR "holder_type" = 'CLEARER'),
  ADD CONSTRAINT "custodies_settlement" CHECK (
    ("status" = 'OPEN' AND "spent_amount" = 0 AND "returned_amount" = 0 AND "extra_amount" = 0
       AND "settlement_date" IS NULL AND "settled_by" IS NULL)
    OR ("status" = 'SETTLED' AND "settlement_date" IS NOT NULL AND "settled_by" IS NOT NULL
       AND "amount" + "extra_amount" - "spent_amount" = "returned_amount"
       AND ("returned_amount" = 0 OR "extra_amount" = 0))),
  ADD CONSTRAINT "custodies_bank_exact" CHECK (
    "holder_type" <> 'BANK_TRANSFER' OR "status" = 'OPEN' OR "spent_amount" = "amount"),
  ADD CONSTRAINT "custodies_approved_after_settlement" CHECK (
    "status" = 'SETTLED' OR "approval_status" = 'PENDING'),
  ADD CONSTRAINT "custodies_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

ALTER TABLE "custody_items"
  ADD CONSTRAINT "custody_items_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "custody_items_receipt_digits" CHECK ("receipt_no" IS NULL OR "receipt_no" ~ '^[0-9]{1,20}$'),
  ADD CONSTRAINT "custody_items_receipt_or_description" CHECK (
    "receipt_no" IS NOT NULL OR length(btrim(coalesce("description", ''))) > 0);

ALTER TABLE "clearer_fees"
  ADD CONSTRAINT "clearer_fees_amounts" CHECK (
    "base" >= 0 AND "extra_rate" >= 0 AND "containers_count" >= 1
    AND "amount" = "base" + "extra_rate" * ("containers_count" - 1));

ALTER TABLE "clearer_fee_adjustments"
  ADD CONSTRAINT "clearer_fee_adjustments_amount" CHECK ("amount" <> 0),
  ADD CONSTRAINT "clearer_fee_adjustments_reason" CHECK (
    ("reason" = 'CONTAINERS_CHANGED' AND "containers_from" IS NOT NULL AND "containers_to" IS NOT NULL)
    OR ("reason" = 'CEO_OVERRIDE' AND length(btrim(coalesce("notes", ''))) >= 3)),
  ADD CONSTRAINT "clearer_fee_adjustments_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

ALTER TABLE "clearer_fee_payments"
  ADD CONSTRAINT "clearer_fee_payments_egp" CHECK ("currency" = 'EGP'),
  ADD CONSTRAINT "clearer_fee_payments_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "clearer_fee_payments_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

-- a custody joins the approval list once settled (issue and settlement approved together)
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
    FROM "clearer_fee_payments" p;
