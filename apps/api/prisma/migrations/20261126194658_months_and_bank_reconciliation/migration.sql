-- CreateEnum
CREATE TYPE "FiscalMonthStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'DIFFERENCE');

-- CreateTable
CREATE TABLE "fiscal_months" (
    "month" DATE NOT NULL,
    "status" "FiscalMonthStatus" NOT NULL DEFAULT 'CLOSED',
    "closed_by" INTEGER,
    "closed_at" TIMESTAMP(3),
    "reopened_by" INTEGER,
    "reopened_at" TIMESTAMP(3),
    "reopen_reason" TEXT,
    "snapshot" JSONB,
    "warnings" JSONB,

    CONSTRAINT "fiscal_months_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "statement_balance" DECIMAL(14,2) NOT NULL,
    "system_balance" DECIMAL(14,2) NOT NULL,
    "outstanding_in" DECIMAL(14,2) NOT NULL,
    "outstanding_out" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "note" TEXT,
    "bank_lines" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliation_items" (
    "id" SERIAL NOT NULL,
    "reconciliation_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "line_key" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "bank_reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_reconciliations_account_id_to_date_idx" ON "bank_reconciliations"("account_id", "to_date");

-- CreateIndex
CREATE INDEX "bank_reconciliation_items_reconciliation_id_idx" ON "bank_reconciliation_items"("reconciliation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliation_items_account_id_line_key_key" ON "bank_reconciliation_items"("account_id", "line_key");

-- AddForeignKey
ALTER TABLE "fiscal_months" ADD CONSTRAINT "fiscal_months_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_months" ADD CONSTRAINT "fiscal_months_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
