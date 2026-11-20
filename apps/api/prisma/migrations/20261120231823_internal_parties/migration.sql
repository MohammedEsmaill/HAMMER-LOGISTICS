-- CreateEnum
CREATE TYPE "InternalPartyKind" AS ENUM ('SISTER_COMPANY', 'OWNER');

-- CreateEnum
CREATE TYPE "PartyMovementKind" AS ENUM ('FUNDING', 'PAYMENT', 'SHARED_DEBT');

-- CreateEnum
CREATE TYPE "AccountOwnership" AS ENUM ('COMPANY', 'PERSONAL');

-- AlterEnum
ALTER TYPE "MovementSource" ADD VALUE 'PARTY';

-- AlterTable
ALTER TABLE "money_accounts" ADD COLUMN     "owner_party_id" INTEGER,
ADD COLUMN     "ownership" "AccountOwnership" NOT NULL DEFAULT 'COMPANY';

-- AlterTable
ALTER TABLE "money_movements" ADD COLUMN     "party_movement_id" INTEGER;

-- CreateTable
CREATE TABLE "internal_parties" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "InternalPartyKind" NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_movements" (
    "id" SERIAL NOT NULL,
    "party_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "kind" "PartyMovementKind" NOT NULL,
    "direction" "MoneyDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "movement_date" DATE NOT NULL,
    "payee" TEXT,
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

    CONSTRAINT "party_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_parties_name_key" ON "internal_parties"("name");

-- CreateIndex
CREATE INDEX "party_movements_party_id_movement_date_idx" ON "party_movements"("party_id", "movement_date");

-- CreateIndex
CREATE INDEX "party_movements_approval_status_idx" ON "party_movements"("approval_status");

-- CreateIndex
CREATE INDEX "money_movements_party_movement_id_idx" ON "money_movements"("party_movement_id");

-- AddForeignKey
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_owner_party_id_fkey" FOREIGN KEY ("owner_party_id") REFERENCES "internal_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_party_movement_id_fkey" FOREIGN KEY ("party_movement_id") REFERENCES "party_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "internal_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_account_id_currency_fkey" FOREIGN KEY ("account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────── checks the schema cannot say ─────────

-- an owner's personal account is a payment channel: it may go below zero
ALTER TABLE "money_accounts" DROP CONSTRAINT "money_accounts_balance_not_negative";
ALTER TABLE "money_accounts"
  ADD CONSTRAINT "money_accounts_balance_not_negative" CHECK ("balance" >= 0 OR "ownership" = 'PERSONAL'),
  ADD CONSTRAINT "money_accounts_personal_owner" CHECK (("ownership" = 'PERSONAL') = ("owner_party_id" IS NOT NULL)),
  ADD CONSTRAINT "money_accounts_personal_bank" CHECK ("ownership" = 'COMPANY' OR ("type" = 'BANK' AND "opening_balance" = 0));
-- the account row holds the rule now; a line's running balance follows its account
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_balance_not_negative";

ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source_fk";
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source_fk" CHECK (
  num_nonnulls("transfer_id", "other_movement_id", "salary_id", "advance_id", "expense_id",
               "custody_id", "fee_payment_id", "collection_id", "party_movement_id") = 1
  AND (("source"::text = 'TRANSFER') = ("transfer_id" IS NOT NULL))
  AND (("source"::text = 'OTHER') = ("other_movement_id" IS NOT NULL))
  AND (("source"::text = 'SALARY') = ("salary_id" IS NOT NULL))
  AND (("source"::text = 'ADVANCE') = ("advance_id" IS NOT NULL))
  AND (("source"::text = 'EXPENSE') = ("expense_id" IS NOT NULL))
  AND (("source"::text = 'CUSTODY') = ("custody_id" IS NOT NULL))
  AND (("source"::text = 'FEE_PAYMENT') = ("fee_payment_id" IS NOT NULL))
  AND (("source"::text = 'COLLECTION') = ("collection_id" IS NOT NULL))
  AND (("source"::text = 'PARTY') = ("party_movement_id" IS NOT NULL)));

ALTER TABLE "internal_parties"
  ADD CONSTRAINT "internal_parties_name" CHECK (length(btrim("name")) >= 2);

ALTER TABLE "party_movements"
  ADD CONSTRAINT "party_movements_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "party_movements_direction" CHECK (("kind" = 'FUNDING') = ("direction" = 'IN')),
  ADD CONSTRAINT "party_movements_payee" CHECK ("kind" <> 'SHARED_DEBT' OR length(btrim(coalesce("payee", ''))) >= 2),
  ADD CONSTRAINT "party_movements_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

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
    FROM "collections" c
  UNION ALL
  SELECT 'PARTY', p."id", p."currency"::text, p."amount", p."movement_date", p."approval_status"::text,
         p."created_by", p."created_at", p."version", p."rejection_reason"
    FROM "party_movements" p;

CREATE OR REPLACE VIEW "journal_v" AS
  SELECT 'TRANSFER'::text AS "type", t."id", ('TR-' || t."id")::text AS "ref",
         t."transfer_date" AS "operation_date", t."currency"::text AS "currency", t."amount",
         'MOVE'::text AS "flow", t."from_account_id", t."to_account_id",
         NULL::text AS "counterparty", NULL::text AS "file_no",
         concat_ws(' · ', CASE WHEN t."cheque_no" IS NOT NULL THEN 'شيك/تحويل ' || t."cheque_no" END, t."notes") AS "description",
         t."approval_status"::text AS "approval_status", t."created_by", t."created_at", false AS "restricted"
    FROM "transfers" t
  UNION ALL
  SELECT 'OTHER', o."id", 'OM-' || o."id", o."movement_date", a."currency"::text, o."amount",
         o."direction"::text,
         CASE WHEN o."direction" = 'OUT' THEN o."account_id" END,
         CASE WHEN o."direction" = 'IN' THEN o."account_id" END,
         NULL, NULL,
         concat_ws(' · ', CASE o."kind" WHEN 'FUNDING' THEN 'تمويل' WHEN 'BANK_CHARGES' THEN 'مصاريف بنكية' ELSE 'تسوية' END, o."reason"),
         o."approval_status"::text, o."created_by", o."created_at", false
    FROM "other_movements" o JOIN "money_accounts" a ON a."id" = o."account_id"
  UNION ALL
  SELECT 'SALARY', s."id", 'SL-' || s."id", s."payment_date", s."currency"::text, s."net",
         'OUT', s."account_id", NULL, e."full_name", NULL,
         concat_ws(' · ', 'مرتب ' || to_char(s."salary_month", 'YYYY-MM'), s."notes"),
         s."approval_status"::text, s."created_by", s."created_at", true
    FROM "salary_payments" s JOIN "employees" e ON e."id" = s."employee_id"
  UNION ALL
  SELECT 'ADVANCE', v."id", 'AD-' || v."id", v."advance_date", v."currency"::text, v."amount",
         'OUT', v."account_id", NULL, e."full_name", NULL,
         concat_ws(' · ', 'سلفة', v."notes"),
         v."approval_status"::text, v."created_by", v."created_at", true
    FROM "employee_advances" v JOIN "employees" e ON e."id" = v."employee_id"
  UNION ALL
  SELECT 'EXPENSE', x."id", 'EX-' || x."id", x."expense_date", x."currency"::text, x."amount",
         'OUT', x."account_id", NULL, x."payee", NULL,
         concat_ws(' · ', et."name", 'إيصال ' || x."receipt_no", x."notes"),
         x."approval_status"::text, x."created_by", x."created_at", false
    FROM "general_expenses" x JOIN "expense_types" et ON et."id" = x."expense_type_id"
  UNION ALL
  SELECT 'CUSTODY', c."id", c."custody_no", c."issue_date", c."currency"::text,
         (c."amount" + c."extra_amount" - c."returned_amount")::numeric(14,2),
         'OUT', c."source_account_id", NULL,
         coalesce(ae."full_name", cl."full_name", b."name",
                  CASE c."holder_type" WHEN 'WAY_OUT' THEN 'إيداع دولاري' WHEN 'BANK_TRANSFER' THEN 'تحويل بنكي' END),
         sh."file_no",
         concat_ws(' · ',
           CASE WHEN c."status" = 'SETTLED'
                THEN 'اتصرف ' || c."amount" || '، اتصفّت: مصروف ' || c."spent_amount" || '، مرتجع ' || c."returned_amount"
                     || CASE WHEN c."extra_amount" > 0 THEN '، زيادة ' || c."extra_amount" ELSE '' END
                ELSE 'مفتوحة' END,
           CASE WHEN c."transfer_ref" IS NOT NULL THEN 'تحويل ' || c."transfer_ref" END,
           c."notes"),
         c."approval_status"::text, c."created_by", c."created_at", false
    FROM "custodies" c
    JOIN "shipments" sh ON sh."id" = c."shipment_id"
    LEFT JOIN "employees" ae ON ae."id" = c."agent_employee_id"
    LEFT JOIN "clearers" cl ON cl."id" = c."clearer_id"
    LEFT JOIN "beneficiaries" b ON b."id" = c."beneficiary_id"
  UNION ALL
  SELECT 'FEE_PAYMENT', p."id", 'FP-' || p."id", p."payment_date", p."currency"::text, p."amount",
         'OUT', p."account_id", NULL, coalesce(b."name", cl."full_name"), sh."file_no",
         concat_ws(' · ', 'أتعاب ' || cl."full_name", CASE WHEN p."transfer_ref" IS NOT NULL THEN 'تحويل ' || p."transfer_ref" END, p."notes"),
         p."approval_status"::text, p."created_by", p."created_at", false
    FROM "clearer_fee_payments" p
    JOIN "clearer_fees" f ON f."id" = p."fee_id"
    JOIN "clearers" cl ON cl."id" = f."clearer_id"
    JOIN "shipments" sh ON sh."id" = f."shipment_id"
    LEFT JOIN "beneficiaries" b ON b."id" = p."beneficiary_id"
  UNION ALL
  SELECT 'COLLECTION', c."id", 'CL-' || c."id", c."collection_date", c."currency"::text, c."amount",
         'IN', NULL, c."account_id", k."name", sh."file_no",
         concat_ws(' · ', CASE c."method" WHEN 'CASH' THEN 'نقدي' ELSE 'تحويل' END, c."reference", c."notes"),
         c."approval_status"::text, c."created_by", c."created_at", false
    FROM "collections" c
    JOIN "clients" k ON k."id" = c."client_id"
    JOIN "shipments" sh ON sh."id" = c."shipment_id"
  UNION ALL
  SELECT 'PARTY', p."id", 'PM-' || p."id", p."movement_date", p."currency"::text, p."amount",
         p."direction"::text,
         CASE WHEN p."direction" = 'OUT' THEN p."account_id" END,
         CASE WHEN p."direction" = 'IN' THEN p."account_id" END,
         ip."name", NULL,
         concat_ws(' · ',
           CASE p."kind" WHEN 'FUNDING' THEN 'تغذية' WHEN 'PAYMENT' THEN 'صرف' ELSE 'سداد مديونيات مشتركة' END,
           p."payee", CASE WHEN p."reference" IS NOT NULL THEN 'مرجع ' || p."reference" END, p."notes"),
         p."approval_status"::text, p."created_by", p."created_at", false
    FROM "party_movements" p JOIN "internal_parties" ip ON ip."id" = p."party_id";
