-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('COMPUTER', 'LAPTOP', 'PRINTER', 'SCANNER', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'SOLD', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "AssetAcquisition" AS ENUM ('PURCHASED', 'EXISTING');

-- CreateEnum
CREATE TYPE "AssetTransactionKind" AS ENUM ('PURCHASE', 'SALE', 'SCRAP');

-- AlterEnum

-- AlterTable
ALTER TABLE "money_movements" ADD COLUMN     "asset_transaction_id" INTEGER;

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" SERIAL NOT NULL,
    "asset_no" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "serial_no" TEXT,
    "location" TEXT,
    "custodian_employee_id" INTEGER,
    "acquisition" "AssetAcquisition" NOT NULL,
    "acquired_on" DATE NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "useful_life_months" INTEGER NOT NULL DEFAULT 60,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposed_on" DATE,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_transactions" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "kind" "AssetTransactionKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "account_id" INTEGER,
    "payment_method" "BankPaymentMethod",
    "reference" TEXT,
    "bank_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "party" TEXT,
    "invoice_no" TEXT,
    "tx_date" DATE NOT NULL,
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

    CONSTRAINT "asset_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_asset_no_key" ON "fixed_assets"("asset_no");

-- CreateIndex
CREATE INDEX "asset_transactions_asset_id_idx" ON "asset_transactions"("asset_id");

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_asset_transaction_id_fkey" FOREIGN KEY ("asset_transaction_id") REFERENCES "asset_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_custodian_employee_id_fkey" FOREIGN KEY ("custodian_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_manager_by_fkey" FOREIGN KEY ("manager_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────── checks the schema cannot say ─────────

ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source_fk";
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source_fk" CHECK (
  num_nonnulls("transfer_id", "other_movement_id", "salary_id", "advance_id", "expense_id",
               "custody_id", "fee_payment_id", "collection_id", "party_movement_id", "asset_transaction_id") = 1
  AND (("source"::text = 'TRANSFER') = ("transfer_id" IS NOT NULL))
  AND (("source"::text = 'OTHER') = ("other_movement_id" IS NOT NULL))
  AND (("source"::text = 'SALARY') = ("salary_id" IS NOT NULL))
  AND (("source"::text = 'ADVANCE') = ("advance_id" IS NOT NULL))
  AND (("source"::text = 'EXPENSE') = ("expense_id" IS NOT NULL))
  AND (("source"::text = 'CUSTODY') = ("custody_id" IS NOT NULL))
  AND (("source"::text = 'FEE_PAYMENT') = ("fee_payment_id" IS NOT NULL))
  AND (("source"::text = 'COLLECTION') = ("collection_id" IS NOT NULL))
  AND (("source"::text = 'PARTY') = ("party_movement_id" IS NOT NULL))
  AND (("source"::text = 'ASSET') = ("asset_transaction_id" IS NOT NULL)));

ALTER TABLE "fixed_assets"
  ADD CONSTRAINT "fixed_assets_cost" CHECK ("cost" >= 2000),
  ADD CONSTRAINT "fixed_assets_life" CHECK ("useful_life_months" BETWEEN 1 AND 600),
  ADD CONSTRAINT "fixed_assets_disposed" CHECK (("status" = 'ACTIVE') = ("disposed_on" IS NULL));

ALTER TABLE "asset_transactions"
  ADD CONSTRAINT "asset_transactions_amount" CHECK ("amount" >= 0 AND ("kind" = 'SCRAP') = ("amount" = 0 AND "account_id" IS NULL)),
  ADD CONSTRAINT "asset_transactions_rejection_reason" CHECK ("approval_status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

-- one purchase and one way out per asset
CREATE UNIQUE INDEX "asset_transactions_one_purchase" ON "asset_transactions" ("asset_id") WHERE "kind" = 'PURCHASE';
CREATE UNIQUE INDEX "asset_transactions_one_disposal" ON "asset_transactions" ("asset_id") WHERE "kind" <> 'PURCHASE';

CREATE OR REPLACE VIEW "journal_v" AS
  SELECT 'TRANSFER'::text AS "type", t."id", ('TR-' || t."id")::text AS "ref",
         t."transfer_date" AS "operation_date", t."currency"::text AS "currency", t."amount",
         'MOVE'::text AS "flow", t."from_account_id", t."to_account_id",
         NULL::text AS "counterparty", NULL::text AS "file_no",
         concat_ws(' · ', CASE WHEN t."cheque_no" IS NOT NULL THEN (CASE t."payment_method" WHEN 'CHEQUE' THEN 'شيك ' ELSE 'تحويل ' END) || t."cheque_no" END, CASE WHEN t."bank_charges" > 0 THEN 'مصاريف بنكية ' || t."bank_charges" END, t."notes") AS "description",
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
  SELECT 'EXPENSE', x."id", 'EX-' || x."id", x."expense_date", x."currency"::text, (x."amount" + x."bank_charges")::numeric(14,2),
         'OUT', x."account_id", NULL, x."payee", NULL,
         concat_ws(' · ', et."name", 'إيصال ' || x."receipt_no", CASE WHEN x."reference" IS NOT NULL THEN (CASE x."payment_method" WHEN 'CHEQUE' THEN 'شيك ' ELSE 'تحويل ' END) || x."reference" END, CASE WHEN x."bank_charges" > 0 THEN 'مصاريف بنكية ' || x."bank_charges" END, x."notes"),
         x."approval_status"::text, x."created_by", x."created_at", false
    FROM "general_expenses" x JOIN "expense_types" et ON et."id" = x."expense_type_id"
  UNION ALL
  SELECT 'CUSTODY', c."id", c."custody_no", c."issue_date", c."currency"::text,
         (c."amount" + c."extra_amount" - c."returned_amount" + c."bank_charges")::numeric(14,2),
         'OUT', c."source_account_id", NULL,
         coalesce(ae."full_name", cl."full_name", b."name",
                  CASE c."holder_type" WHEN 'WAY_OUT' THEN 'إيداع دولاري' WHEN 'BANK_TRANSFER' THEN 'تحويل بنكي' END),
         sh."file_no",
         concat_ws(' · ',
           CASE WHEN c."status" = 'SETTLED'
                THEN 'اتصرف ' || c."amount" || '، اتصفّت: مصروف ' || c."spent_amount" || '، مرتجع ' || c."returned_amount"
                     || CASE WHEN c."extra_amount" > 0 THEN '، زيادة ' || c."extra_amount" ELSE '' END
                     || CASE WHEN c."kept_amount" > 0 THEN '، في حساب المستخلص يُخصم من أتعابه ' || c."kept_amount" ELSE '' END
                ELSE 'مفتوحة' END,
           CASE WHEN c."transfer_ref" IS NOT NULL THEN (CASE c."payment_method" WHEN 'CHEQUE' THEN 'شيك ' ELSE 'تحويل ' END) || c."transfer_ref" END,
           CASE WHEN c."bank_charges" > 0 THEN 'مصاريف بنكية ' || c."bank_charges" END,
           c."notes"),
         c."approval_status"::text, c."created_by", c."created_at", false
    FROM "custodies" c
    JOIN "shipments" sh ON sh."id" = c."shipment_id"
    LEFT JOIN "employees" ae ON ae."id" = c."agent_employee_id"
    LEFT JOIN "clearers" cl ON cl."id" = c."clearer_id"
    LEFT JOIN "beneficiaries" b ON b."id" = c."beneficiary_id"
  UNION ALL
  SELECT 'FEE_PAYMENT', p."id", 'FP-' || p."id", p."payment_date", p."currency"::text, (p."amount" + p."bank_charges")::numeric(14,2),
         'OUT', p."account_id", NULL, coalesce(b."name", cl."full_name"), sh."file_no",
         concat_ws(' · ', 'أتعاب ' || cl."full_name", CASE WHEN p."transfer_ref" IS NOT NULL THEN (CASE p."payment_method" WHEN 'CHEQUE' THEN 'شيك ' ELSE 'تحويل ' END) || p."transfer_ref" END, CASE WHEN p."bank_charges" > 0 THEN 'مصاريف بنكية ' || p."bank_charges" END, p."notes"),
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
  SELECT 'PARTY', p."id", 'PM-' || p."id", p."movement_date", p."currency"::text,
         (CASE WHEN p."direction" = 'OUT' THEN p."amount" + p."bank_charges" ELSE p."amount" END)::numeric(14,2),
         p."direction"::text,
         CASE WHEN p."direction" = 'OUT' THEN p."account_id" END,
         CASE WHEN p."direction" = 'IN' THEN p."account_id" END,
         ip."name", NULL,
         concat_ws(' · ',
           CASE p."kind" WHEN 'FUNDING' THEN 'تغذية' WHEN 'PAYMENT' THEN 'صرف' ELSE 'سداد مديونيات مشتركة' END,
           p."payee", CASE WHEN p."reference" IS NOT NULL THEN (CASE p."payment_method" WHEN 'CHEQUE' THEN 'شيك ' WHEN 'TRANSFER' THEN 'تحويل ' ELSE 'مرجع ' END) || p."reference" END,
           CASE WHEN p."bank_charges" > 0 THEN 'مصاريف بنكية ' || p."bank_charges" END, p."notes"),
         p."approval_status"::text, p."created_by", p."created_at", false
    FROM "party_movements" p JOIN "internal_parties" ip ON ip."id" = p."party_id"
  UNION ALL -- fixed assets: bought (money out) or sold (money in); a scrapped one moves no money
  SELECT 'ASSET', t."id", 'AT-' || t."id", t."tx_date", 'EGP',
         (t."amount" + CASE WHEN t."kind" = 'PURCHASE' THEN t."bank_charges" ELSE 0 END)::numeric(14,2),
         CASE WHEN t."kind" = 'PURCHASE' THEN 'OUT' ELSE 'IN' END,
         CASE WHEN t."kind" = 'PURCHASE' THEN t."account_id" END,
         CASE WHEN t."kind" = 'SALE' THEN t."account_id" END,
         t."party", NULL,
         concat_ws(' · ', CASE t."kind" WHEN 'PURCHASE' THEN 'شراء أصل' ELSE 'بيع أصل' END, fa."asset_no", fa."name",
           CASE WHEN t."invoice_no" IS NOT NULL THEN 'فاتورة ' || t."invoice_no" END,
           CASE WHEN t."reference" IS NOT NULL THEN 'مرجع ' || t."reference" END,
           CASE WHEN t."bank_charges" > 0 THEN 'مصاريف بنكية ' || t."bank_charges" END, t."notes"),
         t."approval_status"::text, t."created_by", t."created_at", false
    FROM "asset_transactions" t JOIN "fixed_assets" fa ON fa."id" = t."asset_id"
   WHERE t."kind" <> 'SCRAP';

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
    FROM "party_movements" p
  UNION ALL
  SELECT 'ASSET', t."id", 'EGP', t."amount", t."tx_date", t."approval_status"::text,
         t."created_by", t."created_at", t."version", t."rejection_reason"
    FROM "asset_transactions" t;

CREATE OR REPLACE VIEW "gl_lines_v" AS
WITH legs AS (
  -- opening balances of the cash boxes and bank accounts
  SELECT a."created_at"::date AS entry_date, a."currency"::text AS currency,
         'OPENING' AS source_type, a."id" AS source_id, a."name" AS ref,
         'رصيد افتتاحي' AS description,
         NULL::int AS client_id, NULL::int AS clearer_id, NULL::int AS employee_id,
         NULL::int AS party_id, NULL::int AS shipment_id,
         x.k AS account_key, x.d AS debit, x.c AS credit
    FROM "money_accounts" a,
         LATERAL (VALUES ('MA:' || a."id", a."opening_balance", 0::numeric),
                         ('OPENING', 0::numeric, a."opening_balance")) x(k, d, c)
   WHERE a."opening_balance" <> 0

  UNION ALL -- transfers between our accounts, and the bank's charges on them
  SELECT t."transfer_date", t."currency"::text, 'TRANSFER', t."id", 'TR-' || t."id",
         'تحويل' || COALESCE(' · شيك ' || t."cheque_no", ''),
         NULL, NULL, NULL, NULL, NULL, x.k, x.d, x.c
    FROM "transfers" t,
         LATERAL (VALUES ('MA:' || t."to_account_id", t."amount", 0::numeric),
                         ('MA:' || t."from_account_id", 0::numeric, t."amount"),
                         ('BANK_CHARGES', t."bank_charges", 0::numeric),
                         ('MA:' || t."from_account_id", 0::numeric, t."bank_charges")) x(k, d, c)

  UNION ALL -- funding from the management, bank charges, cash adjustments
  SELECT o."movement_date", a."currency"::text, 'OTHER', o."id", 'OM-' || o."id", o."reason",
         NULL, NULL, NULL, NULL, NULL, x.k, x.d, x.c
    FROM "other_movements" o
    JOIN "money_accounts" a ON a."id" = o."account_id",
         LATERAL (SELECT CASE o."kind" WHEN 'FUNDING' THEN 'FUNDING'
                                       WHEN 'BANK_CHARGES' THEN 'BANK_CHARGES'
                                       ELSE 'ADJUSTMENT' END AS other) k,
         LATERAL (VALUES ('MA:' || o."account_id",
                          CASE WHEN o."direction" = 'IN' THEN o."amount" ELSE 0 END,
                          CASE WHEN o."direction" = 'OUT' THEN o."amount" ELSE 0 END),
                         (k.other,
                          CASE WHEN o."direction" = 'OUT' THEN o."amount" ELSE 0 END,
                          CASE WHEN o."direction" = 'IN' THEN o."amount" ELSE 0 END)) x(k, d, c)

  UNION ALL -- salaries: the expense is the net paid plus the advance taken back
  SELECT s."payment_date", s."currency"::text, 'SALARY', s."id", 'SL-' || s."id",
         'مرتب ' || to_char(s."salary_month", 'MM-YYYY'),
         NULL, NULL, s."employee_id", NULL, NULL, x.k, x.d, x.c
    FROM "salary_payments" s,
         LATERAL (VALUES ('SALARIES', s."net" + s."advance_deduction", 0::numeric),
                         ('MA:' || s."account_id", 0::numeric, s."net"),
                         ('EMPLOYEE_ADVANCES', 0::numeric, s."advance_deduction")) x(k, d, c)

  UNION ALL -- advances to employees
  SELECT v."advance_date", v."currency"::text, 'ADVANCE', v."id", 'AD-' || v."id", 'سلفة',
         NULL, NULL, v."employee_id", NULL, NULL, x.k, x.d, x.c
    FROM "employee_advances" v,
         LATERAL (VALUES ('EMPLOYEE_ADVANCES', v."amount", 0::numeric),
                         ('MA:' || v."account_id", 0::numeric, v."amount")) x(k, d, c)

  UNION ALL -- general expenses by their main category, and the bank's charges
  SELECT e."expense_date", e."currency"::text, 'EXPENSE', e."id", 'EX-' || e."id",
         et."name" || ' · ' || e."payee",
         NULL, NULL, NULL, NULL, NULL, x.k, x.d, x.c
    FROM "general_expenses" e
    JOIN "expense_types" et ON et."id" = e."expense_type_id",
         LATERAL (VALUES ('EXP:' || COALESCE(et."category"::text, 'GENERAL_EXPENSES'), e."amount", 0::numeric),
                         ('MA:' || e."account_id", 0::numeric, e."amount"),
                         ('BANK_CHARGES', e."bank_charges", 0::numeric),
                         ('MA:' || e."account_id", 0::numeric, e."bank_charges")) x(k, d, c)

  UNION ALL -- a custody issued: the holder owes it until settled
  SELECT c."issue_date", c."currency"::text, 'CUSTODY', c."id", c."custody_no", 'صرف عهدة',
         NULL, c."clearer_id", c."agent_employee_id", NULL, c."shipment_id", x.k, x.d, x.c
    FROM "custodies" c,
         LATERAL (VALUES ('CUSTODY', c."amount", 0::numeric),
                         ('MA:' || c."source_account_id", 0::numeric, c."amount"),
                         ('BANK_CHARGES', c."bank_charges", 0::numeric),
                         ('MA:' || c."source_account_id", 0::numeric, c."bank_charges")) x(k, d, c)

  UNION ALL -- settled: what was spent is the client's to pay back; the rest comes back,
            -- or stays with the clearer against his fees; an overspend is paid out
  SELECT c."settlement_date", c."currency"::text, 'CUSTODY', c."id", c."custody_no", 'تصفية عهدة',
         NULL, c."clearer_id", c."agent_employee_id", NULL, c."shipment_id", x.k, x.d, x.c
    FROM "custodies" c,
         LATERAL (VALUES ('REIMBURSABLE', c."spent_amount", 0::numeric),
                         ('MA:' || c."source_account_id", c."returned_amount", 0::numeric),
                         ('CLEARER_PAYABLE', c."kept_amount", 0::numeric),
                         ('CUSTODY', 0::numeric, c."amount"),
                         ('MA:' || COALESCE(c."extra_account_id", c."source_account_id"), 0::numeric, c."extra_amount")) x(k, d, c)
   WHERE c."status" = 'SETTLED'

  UNION ALL -- a clearer's fee, owed from the settlement it was computed with
  SELECT c."settlement_date", 'EGP', 'FEE', f."id", c."custody_no", 'أتعاب مستخلص',
         NULL, f."clearer_id", NULL, NULL, f."shipment_id", x.k, x.d, x.c
    FROM "clearer_fees" f
    JOIN "custodies" c ON c."id" = f."custody_id",
         LATERAL (VALUES ('CLEARER_FEES', f."amount", 0::numeric),
                         ('CLEARER_PAYABLE', 0::numeric, f."amount")) x(k, d, c)

  UNION ALL -- its adjustments (+ or −)
  SELECT j."adjustment_date", 'EGP', 'FEE_ADJUSTMENT', j."id", 'FA-' || j."id", 'تسوية أتعاب',
         NULL, f."clearer_id", NULL, NULL, f."shipment_id", x.k, x.d, x.c
    FROM "clearer_fee_adjustments" j
    JOIN "clearer_fees" f ON f."id" = j."fee_id",
         LATERAL (VALUES ('CLEARER_FEES', GREATEST(j."amount", 0), GREATEST(-j."amount", 0)),
                         ('CLEARER_PAYABLE', GREATEST(-j."amount", 0), GREATEST(j."amount", 0))) x(k, d, c)

  UNION ALL -- paying a clearer, and the bank's charges
  SELECT p."payment_date", p."currency"::text, 'FEE_PAYMENT', p."id", 'FP-' || p."id", 'صرف أتعاب',
         NULL, f."clearer_id", NULL, NULL, f."shipment_id", x.k, x.d, x.c
    FROM "clearer_fee_payments" p
    JOIN "clearer_fees" f ON f."id" = p."fee_id",
         LATERAL (VALUES ('CLEARER_PAYABLE', p."amount", 0::numeric),
                         ('MA:' || p."account_id", 0::numeric, p."amount"),
                         ('BANK_CHARGES', p."bank_charges", 0::numeric),
                         ('MA:' || p."account_id", 0::numeric, p."bank_charges")) x(k, d, c)

  UNION ALL -- a client statement: the client owes it; it closes what was spent for them,
            -- and the difference is the markup
  SELECT i."invoice_date", i."currency"::text, 'INVOICE', i."id", i."invoice_no", 'كشف حساب العميل',
         s."client_id", NULL, NULL, NULL, i."shipment_id", x.k, x.d, x.c
    FROM "invoices" i
    JOIN "shipments" s ON s."id" = i."shipment_id",
         LATERAL (SELECT COALESCE(SUM(ci."amount"), 0) AS actual
                    FROM "custody_items" ci
                    JOIN "custodies" c ON c."id" = ci."custody_id"
                   WHERE c."shipment_id" = i."shipment_id" AND c."status" = 'SETTLED'
                     AND c."currency" = i."currency") a,
         LATERAL (VALUES ('RECEIVABLE', i."total", 0::numeric),
                         ('REIMBURSABLE', 0::numeric, a.actual),
                         ('MARKUP', GREATEST(a.actual - i."total", 0), GREATEST(i."total" - a.actual, 0))) x(k, d, c)
   WHERE i."type" = 'STATEMENT' AND i."voided_at" IS NULL

  UNION ALL -- the clearance invoice: our revenue and the VAT owed on it
  SELECT i."invoice_date", i."currency"::text, 'INVOICE', i."id", i."invoice_no", 'فاتورة تخليص',
         s."client_id", NULL, NULL, NULL, i."shipment_id", x.k, x.d, x.c
    FROM "invoices" i
    JOIN "shipments" s ON s."id" = i."shipment_id",
         LATERAL (VALUES ('RECEIVABLE', i."total", 0::numeric),
                         ('WHT_RECEIVABLE', i."wht", 0::numeric),
                         ('CLEARANCE_REVENUE', 0::numeric, i."subtotal"),
                         ('VAT_PAYABLE', 0::numeric, i."vat_amount")) x(k, d, c)
   WHERE i."type" = 'CLEARANCE' AND i."voided_at" IS NULL

  UNION ALL -- collecting from a client
  SELECT l."collection_date", l."currency"::text, 'COLLECTION', l."id", 'CL-' || l."id", 'تحصيل',
         l."client_id", NULL, NULL, NULL, l."shipment_id", x.k, x.d, x.c
    FROM "collections" l,
         LATERAL (VALUES ('MA:' || l."account_id", l."amount", 0::numeric),
                         ('RECEIVABLE', 0::numeric, l."amount")) x(k, d, c)

  UNION ALL -- the sister companies and owners: money in or out on their current account
  SELECT m."movement_date", m."currency"::text, 'PARTY', m."id", 'PM-' || m."id",
         CASE m."kind" WHEN 'FUNDING' THEN 'تمويل' WHEN 'PAYMENT' THEN 'صرف' ELSE 'سداد مديونيات مشتركة' END
           || COALESCE(' · ' || m."payee", ''),
         NULL, NULL, NULL, m."party_id", NULL, x.k, x.d, x.c
    FROM "party_movements" m,
         LATERAL (VALUES ('MA:' || m."account_id",
                          CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE 0 END,
                          CASE WHEN m."direction" = 'OUT' THEN m."amount" ELSE 0 END),
                         ('PARTY:' || m."party_id",
                          CASE WHEN m."direction" = 'OUT' THEN m."amount" ELSE 0 END,
                          CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE 0 END),
                         ('BANK_CHARGES', m."bank_charges", 0::numeric),
                         ('MA:' || m."account_id", 0::numeric, m."bank_charges")) x(k, d, c)

  UNION ALL -- a fixed asset the company had before enters the books the day it is registered:
            -- its cost, the depreciation built up until then, the rest against the opening balances
  SELECT a."created_at"::date, 'EGP', 'ASSET', a."id", a."asset_no", 'أصل ثابت موجود · ' || a."name",
         NULL, NULL, a."custodian_employee_id", NULL, NULL, x.k, x.d, x.c
    FROM "fixed_assets" a,
         LATERAL (SELECT COALESCE(SUM(CASE WHEN n = a."useful_life_months"
                                           THEN a."cost" - round(a."cost" / a."useful_life_months", 2) * (a."useful_life_months" - 1)
                                           ELSE round(a."cost" / a."useful_life_months", 2) END), 0) AS "acc"
                    FROM generate_series(1, a."useful_life_months") n
                   WHERE (date_trunc('month', a."acquired_on") + (n || ' month')::interval - interval '1 day')::date < a."created_at"::date) dep,
         LATERAL (VALUES ('FIXED_ASSETS', a."cost", 0::numeric),
                         ('ACC_DEPRECIATION', 0::numeric, dep."acc"),
                         ('OPENING', 0::numeric, a."cost" - dep."acc")) x(k, d, c)
   WHERE a."acquisition" = 'EXISTING'

  UNION ALL -- buying a fixed asset, with the bank's charges
  SELECT t."tx_date", 'EGP', 'ASSET_TX', t."id", 'AT-' || t."id", 'شراء أصل · ' || a."asset_no" || ' · ' || a."name",
         NULL, NULL, NULL, NULL, NULL, x.k, x.d, x.c
    FROM "asset_transactions" t JOIN "fixed_assets" a ON a."id" = t."asset_id",
         LATERAL (VALUES ('FIXED_ASSETS', t."amount", 0::numeric),
                         ('MA:' || t."account_id", 0::numeric, t."amount"),
                         ('BANK_CHARGES', t."bank_charges", 0::numeric),
                         ('MA:' || t."account_id", 0::numeric, t."bank_charges")) x(k, d, c)
   WHERE t."kind" = 'PURCHASE'

  UNION ALL -- depreciation, straight-line: one share at each month end from the month acquired,
            -- the last share taking the rounding, none after the asset leaves
  SELECT d."month_end", 'EGP', 'DEPRECIATION', a."id", a."asset_no",
         'إهلاك ' || to_char(d."month_end", 'YYYY-MM') || ' · ' || a."name",
         NULL, NULL, NULL, NULL, NULL, x.k, x.d, x.c
    FROM "fixed_assets" a,
         LATERAL (SELECT (date_trunc('month', a."acquired_on") + (n || ' month')::interval - interval '1 day')::date AS "month_end",
                         CASE WHEN n = a."useful_life_months"
                              THEN a."cost" - round(a."cost" / a."useful_life_months", 2) * (a."useful_life_months" - 1)
                              ELSE round(a."cost" / a."useful_life_months", 2) END AS "share"
                    FROM generate_series(1, a."useful_life_months") n) d,
         LATERAL (VALUES ('DEPRECIATION', d."share", 0::numeric),
                         ('ACC_DEPRECIATION', 0::numeric, d."share")) x(k, d, c)
   WHERE d."month_end" <= CURRENT_DATE
     AND (a."disposed_on" IS NULL OR d."month_end" <= a."disposed_on")
     -- a device had before: what came before its registration is in its opening entry
     AND (a."acquisition" = 'PURCHASED' OR d."month_end" >= a."created_at"::date)

  UNION ALL -- selling or scrapping: the cost and its depreciation leave, the price comes in,
            -- and what is left is a gain or a loss
  SELECT t."tx_date", 'EGP', 'ASSET_TX', t."id", 'AT-' || t."id",
         CASE t."kind" WHEN 'SALE' THEN 'بيع أصل · ' ELSE 'تكهين أصل · ' END || a."asset_no" || ' · ' || a."name",
         NULL, NULL, NULL, NULL, NULL, x.k, x.d, x.c
    FROM "asset_transactions" t JOIN "fixed_assets" a ON a."id" = t."asset_id",
         LATERAL (SELECT COALESCE(SUM(CASE WHEN n = a."useful_life_months"
                                           THEN a."cost" - round(a."cost" / a."useful_life_months", 2) * (a."useful_life_months" - 1)
                                           ELSE round(a."cost" / a."useful_life_months", 2) END), 0) AS "acc"
                    FROM generate_series(1, a."useful_life_months") n
                   WHERE (date_trunc('month', a."acquired_on") + (n || ' month')::interval - interval '1 day')::date <= LEAST(t."tx_date", CURRENT_DATE)) dep,
         LATERAL (VALUES ('ACC_DEPRECIATION', dep."acc", 0::numeric),
                         ('MA:' || COALESCE(t."account_id", 0), t."amount", 0::numeric),
                         ('FIXED_ASSETS', 0::numeric, a."cost"),
                         ('ASSET_DISPOSAL', GREATEST(a."cost" - dep."acc" - t."amount", 0), GREATEST(t."amount" - (a."cost" - dep."acc"), 0))) x(k, d, c)
   WHERE t."kind" IN ('SALE', 'SCRAP')
)
SELECT * FROM legs WHERE debit <> 0 OR credit <> 0;
