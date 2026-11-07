-- CreateEnum
CREATE TYPE "ExpenseScope" AS ENUM ('GENERAL', 'SHIPMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementSource" ADD VALUE 'SALARY';
ALTER TYPE "MovementSource" ADD VALUE 'ADVANCE';
ALTER TYPE "MovementSource" ADD VALUE 'EXPENSE';

-- AlterTable
ALTER TABLE "money_movements" ADD COLUMN     "advance_id" INTEGER,
ADD COLUMN     "expense_id" INTEGER,
ADD COLUMN     "salary_id" INTEGER;

-- CreateTable
CREATE TABLE "salary_payments" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "salary_month" DATE NOT NULL,
    "basic" DECIMAL(14,2) NOT NULL,
    "adjustments" JSONB NOT NULL DEFAULT '[]',
    "additions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance_deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL,
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

    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_advances" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "advance_date" DATE NOT NULL,
    "account_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
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

    CONSTRAINT "employee_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "ExpenseScope" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_expenses" (
    "id" SERIAL NOT NULL,
    "expense_type_id" INTEGER NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "expense_date" DATE NOT NULL,
    "account_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
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

    CONSTRAINT "general_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_payments_approval_status_idx" ON "salary_payments"("approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_employee_id_salary_month_key" ON "salary_payments"("employee_id", "salary_month");

-- CreateIndex
CREATE INDEX "employee_advances_employee_id_idx" ON "employee_advances"("employee_id");

-- CreateIndex
CREATE INDEX "employee_advances_approval_status_idx" ON "employee_advances"("approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "expense_types_scope_name_key" ON "expense_types"("scope", "name");

-- CreateIndex
CREATE INDEX "general_expenses_expense_date_idx" ON "general_expenses"("expense_date");

-- CreateIndex
CREATE INDEX "general_expenses_approval_status_idx" ON "general_expenses"("approval_status");

-- CreateIndex
CREATE INDEX "money_movements_salary_id_idx" ON "money_movements"("salary_id");

-- CreateIndex
CREATE INDEX "money_movements_advance_id_idx" ON "money_movements"("advance_id");

-- CreateIndex
CREATE INDEX "money_movements_expense_id_idx" ON "money_movements"("expense_id");

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_salary_id_fkey" FOREIGN KEY ("salary_id") REFERENCES "salary_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "employee_advances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "general_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_account_id_currency_fkey" FOREIGN KEY ("account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_account_id_currency_fkey" FOREIGN KEY ("account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_expenses" ADD CONSTRAINT "general_expenses_expense_type_id_fkey" FOREIGN KEY ("expense_type_id") REFERENCES "expense_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_expenses" ADD CONSTRAINT "general_expenses_account_id_currency_fkey" FOREIGN KEY ("account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_expenses" ADD CONSTRAINT "general_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_expenses" ADD CONSTRAINT "general_expenses_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_expenses" ADD CONSTRAINT "general_expenses_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_expenses" ADD CONSTRAINT "general_expenses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_expenses" ADD CONSTRAINT "general_expenses_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Business rules Prisma cannot express ─────

-- each ledger line carries the FK of its own source and no other
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source_fk";
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source_fk" CHECK (
  num_nonnulls("transfer_id", "other_movement_id", "salary_id", "advance_id", "expense_id") = 1
  AND (("source"::text = 'TRANSFER') = ("transfer_id" IS NOT NULL))
  AND (("source"::text = 'OTHER') = ("other_movement_id" IS NOT NULL))
  AND (("source"::text = 'SALARY') = ("salary_id" IS NOT NULL))
  AND (("source"::text = 'ADVANCE') = ("advance_id" IS NOT NULL))
  AND (("source"::text = 'EXPENSE') = ("expense_id" IS NOT NULL)));

ALTER TABLE "salary_payments"
  ADD CONSTRAINT "salary_payments_egp" CHECK ("currency" = 'EGP'),
  ADD CONSTRAINT "salary_payments_month_start" CHECK (extract(day FROM "salary_month") = 1),
  ADD CONSTRAINT "salary_payments_amounts" CHECK (
    "basic" >= 0 AND "additions" >= 0 AND "deductions" >= 0 AND "advance_deduction" >= 0 AND "net" >= 0),
  ADD CONSTRAINT "salary_payments_net" CHECK (
    "net" = "basic" + "additions" - "deductions" - "advance_deduction"),
  ADD CONSTRAINT "salary_payments_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

ALTER TABLE "employee_advances"
  ADD CONSTRAINT "employee_advances_egp" CHECK ("currency" = 'EGP'),
  ADD CONSTRAINT "employee_advances_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "employee_advances_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

ALTER TABLE "expense_types"
  ADD CONSTRAINT "expense_types_name" CHECK (length(btrim("name")) >= 2);

ALTER TABLE "general_expenses"
  ADD CONSTRAINT "general_expenses_egp" CHECK ("currency" = 'EGP'),
  ADD CONSTRAINT "general_expenses_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "general_expenses_receipt" CHECK (length(btrim("receipt_no")) >= 1),
  ADD CONSTRAINT "general_expenses_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

-- the approval list now covers office expenses too
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
    FROM "general_expenses" e;
