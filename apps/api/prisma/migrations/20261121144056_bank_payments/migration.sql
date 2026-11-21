-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('GENERAL_EXPENSES', 'TRANSPORT', 'TIPS_DONATIONS', 'PETTY', 'PURCHASES', 'COMMISSIONS', 'BILLS_UTILITIES');

-- CreateEnum
CREATE TYPE "BankPaymentMethod" AS ENUM ('TRANSFER', 'CHEQUE');

-- AlterTable
ALTER TABLE "clearer_fee_payments" ADD COLUMN     "bank_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" "BankPaymentMethod";

-- AlterTable
ALTER TABLE "custodies" ADD COLUMN     "bank_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" "BankPaymentMethod";

-- AlterTable
ALTER TABLE "expense_types" ADD COLUMN     "category" "ExpenseCategory";

-- AlterTable
ALTER TABLE "general_expenses" ADD COLUMN     "bank_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" "BankPaymentMethod",
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "party_movements" ADD COLUMN     "bank_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" "BankPaymentMethod";

-- AlterTable
ALTER TABLE "transfers" ADD COLUMN     "bank_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" "BankPaymentMethod";

-- ───────── checks the schema cannot say ─────────

-- the main item of each general expense type; the office's first types placed by name
UPDATE "expense_types" SET "category" = CASE
    WHEN "name" ~ '(كهرب|مياه|مية|غاز|تليفون|انترنت|إنترنت)' THEN 'BILLS_UTILITIES'::"ExpenseCategory"
    WHEN "name" ~ '(بوفيه|ضيافة|نثري)' THEN 'PETTY'::"ExpenseCategory"
    WHEN "name" ~ '(أدوات|ادوات|مشتري|شراء)' THEN 'PURCHASES'::"ExpenseCategory"
    WHEN "name" ~ '(انتقال|مواصلات|بنزين|سفر)' THEN 'TRANSPORT'::"ExpenseCategory"
    WHEN "name" ~ '(إكرامي|اكرامي|تبرع)' THEN 'TIPS_DONATIONS'::"ExpenseCategory"
    WHEN "name" ~ '(عمول)' THEN 'COMMISSIONS'::"ExpenseCategory"
    ELSE 'GENERAL_EXPENSES'::"ExpenseCategory" END
  WHERE "scope" = 'GENERAL';
ALTER TABLE "expense_types"
  ADD CONSTRAINT "expense_types_category" CHECK (("scope" = 'GENERAL') = ("category" IS NOT NULL));

-- a cash payment has no method and no charges; a bank one names its reference
ALTER TABLE "transfers"
  ADD CONSTRAINT "transfers_bank_charges" CHECK ("bank_charges" >= 0 AND ("payment_method" IS NOT NULL OR "bank_charges" = 0)),
  ADD CONSTRAINT "transfers_payment_reference" CHECK ("payment_method" IS NULL OR "cheque_no" IS NOT NULL);
ALTER TABLE "general_expenses"
  ADD CONSTRAINT "general_expenses_bank_charges" CHECK ("bank_charges" >= 0 AND ("payment_method" IS NOT NULL OR "bank_charges" = 0)),
  ADD CONSTRAINT "general_expenses_payment_reference" CHECK (("payment_method" IS NULL) = ("reference" IS NULL));
ALTER TABLE "custodies"
  ADD CONSTRAINT "custodies_bank_charges" CHECK ("bank_charges" >= 0 AND ("payment_method" IS NOT NULL OR "bank_charges" = 0)),
  ADD CONSTRAINT "custodies_payment_reference" CHECK ("payment_method" IS NULL OR "transfer_ref" IS NOT NULL);
ALTER TABLE "clearer_fee_payments"
  ADD CONSTRAINT "clearer_fee_payments_bank_charges" CHECK ("bank_charges" >= 0 AND ("payment_method" IS NOT NULL OR "bank_charges" = 0)),
  ADD CONSTRAINT "clearer_fee_payments_payment_reference" CHECK ("payment_method" IS NULL OR "transfer_ref" IS NOT NULL);
ALTER TABLE "party_movements"
  ADD CONSTRAINT "party_movements_bank_charges" CHECK ("bank_charges" >= 0 AND ("payment_method" IS NOT NULL OR "bank_charges" = 0)),
  ADD CONSTRAINT "party_movements_payment_reference" CHECK ("payment_method" IS NULL OR "reference" IS NOT NULL);

-- the journal: money out includes the bank charges paid with it
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
    FROM "party_movements" p JOIN "internal_parties" ip ON ip."id" = p."party_id";


-- a clearer's custody may be paid by bank transfer into his own account
ALTER TABLE "custodies" DROP CONSTRAINT "custodies_beneficiary";
ALTER TABLE "custodies" DROP CONSTRAINT "custodies_transfer_ref";
ALTER TABLE "custodies"
  ADD CONSTRAINT "custodies_beneficiary" CHECK (
    ("holder_type" = 'BANK_TRANSFER' AND "beneficiary_id" IS NOT NULL)
    OR ("holder_type" = 'CLEARER')
    OR ("beneficiary_id" IS NULL)),
  ADD CONSTRAINT "custodies_transfer_ref" CHECK ("transfer_ref" IS NULL OR "holder_type" IN ('BANK_TRANSFER', 'CLEARER'));
