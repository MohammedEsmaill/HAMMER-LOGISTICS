-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EGP', 'USD');

-- CreateEnum
CREATE TYPE "MoneyAccountType" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "MoneyDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MovementSource" AS ENUM ('TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "OtherMovementKind" AS ENUM ('FUNDING', 'BANK_CHARGES', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'REVIEWED', 'MANAGER_APPROVED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "money_accounts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MoneyAccountType" NOT NULL,
    "currency" "Currency" NOT NULL,
    "bank_name" TEXT,
    "account_number" TEXT,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_movements" (
    "id" BIGSERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "direction" "MoneyDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "movement_date" DATE NOT NULL,
    "source" "MovementSource" NOT NULL,
    "transfer_id" INTEGER,
    "other_movement_id" INTEGER,
    "reversal_of_id" BIGINT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" SERIAL NOT NULL,
    "from_account_id" INTEGER NOT NULL,
    "to_account_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "cheque_no" TEXT,
    "transfer_date" DATE NOT NULL,
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

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_movements" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "kind" "OtherMovementKind" NOT NULL,
    "direction" "MoneyDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "movement_date" DATE NOT NULL,
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

    CONSTRAINT "other_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "money_accounts_id_currency_key" ON "money_accounts"("id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "money_movements_reversal_of_id_key" ON "money_movements"("reversal_of_id");

-- CreateIndex
CREATE INDEX "money_movements_account_id_id_idx" ON "money_movements"("account_id", "id");

-- CreateIndex
CREATE INDEX "money_movements_transfer_id_idx" ON "money_movements"("transfer_id");

-- CreateIndex
CREATE INDEX "money_movements_other_movement_id_idx" ON "money_movements"("other_movement_id");

-- CreateIndex
CREATE INDEX "transfers_approval_status_idx" ON "transfers"("approval_status");

-- CreateIndex
CREATE INDEX "other_movements_approval_status_idx" ON "other_movements"("approval_status");

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_other_movement_id_fkey" FOREIGN KEY ("other_movement_id") REFERENCES "other_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "money_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_currency_fkey" FOREIGN KEY ("from_account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_currency_fkey" FOREIGN KEY ("to_account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_movements" ADD CONSTRAINT "other_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_movements" ADD CONSTRAINT "other_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_movements" ADD CONSTRAINT "other_movements_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_movements" ADD CONSTRAINT "other_movements_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_movements" ADD CONSTRAINT "other_movements_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_movements" ADD CONSTRAINT "other_movements_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Business rules Prisma cannot express ─────

-- one cash box per currency; bank details required for a bank account only
CREATE UNIQUE INDEX "money_accounts_one_cash_per_currency" ON "money_accounts" ("currency") WHERE "type" = 'CASH';
ALTER TABLE "money_accounts"
  ADD CONSTRAINT "money_accounts_balance_not_negative" CHECK ("balance" >= 0),
  ADD CONSTRAINT "money_accounts_opening_not_negative" CHECK ("opening_balance" >= 0),
  ADD CONSTRAINT "money_accounts_bank_details" CHECK (
    ("type" = 'BANK' AND "bank_name" IS NOT NULL AND "account_number" IS NOT NULL)
    OR ("type" = 'CASH' AND "bank_name" IS NULL AND "account_number" IS NULL));
CREATE UNIQUE INDEX "money_accounts_bank_number_unique" ON "money_accounts" ("bank_name", "account_number") WHERE "type" = 'BANK';

-- ledger lines: positive amounts, the FK of their own source and no other
ALTER TABLE "money_movements"
  ADD CONSTRAINT "money_movements_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "money_movements_balance_not_negative" CHECK ("balance_after" >= 0),
  ADD CONSTRAINT "money_movements_source_fk" CHECK (
    ("source" = 'TRANSFER' AND "transfer_id" IS NOT NULL AND "other_movement_id" IS NULL)
    OR ("source" = 'OTHER' AND "other_movement_id" IS NOT NULL AND "transfer_id" IS NULL));

CREATE FUNCTION "forbid_movement_change"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'money_movements is append-only: correct with a reversal line'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER "money_movements_append_only" BEFORE UPDATE OR DELETE ON "money_movements"
  FOR EACH ROW EXECUTE FUNCTION "forbid_movement_change"();

ALTER TABLE "transfers"
  ADD CONSTRAINT "transfers_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "transfers_different_accounts" CHECK ("from_account_id" <> "to_account_id"),
  ADD CONSTRAINT "transfers_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

ALTER TABLE "other_movements"
  ADD CONSTRAINT "other_movements_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "other_movements_reason" CHECK (length(btrim("reason")) >= 3),
  ADD CONSTRAINT "other_movements_kind_direction" CHECK (
    ("kind" = 'FUNDING' AND "direction" = 'IN')
    OR ("kind" = 'BANK_CHARGES' AND "direction" = 'OUT')
    OR "kind" = 'ADJUSTMENT'),
  ADD CONSTRAINT "other_movements_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

-- every financial document in one list, for the approval screen (later phases add their tables)
CREATE VIEW "financial_operations_v" AS
  SELECT 'TRANSFER'::text AS "type", t."id", t."currency"::text AS "currency", t."amount",
         t."transfer_date" AS "operation_date", t."approval_status"::text AS "approval_status",
         t."created_by", t."created_at", t."version", t."rejection_reason"
    FROM "transfers" t
  UNION ALL
  SELECT 'OTHER', o."id", a."currency"::text, o."amount", o."movement_date", o."approval_status"::text,
         o."created_by", o."created_at", o."version", o."rejection_reason"
    FROM "other_movements" o JOIN "money_accounts" a ON a."id" = o."account_id";
