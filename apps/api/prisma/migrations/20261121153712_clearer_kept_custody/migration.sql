-- AlterTable
ALTER TABLE "custodies" ADD COLUMN     "extra_account_id" INTEGER,
ADD COLUMN     "extra_payment_method" "BankPaymentMethod",
ADD COLUMN     "extra_reference" TEXT,
ADD COLUMN     "kept_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "clearer_fee_offsets" (
    "id" SERIAL NOT NULL,
    "fee_id" INTEGER NOT NULL,
    "custody_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clearer_fee_offsets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clearer_fee_offsets_fee_id_idx" ON "clearer_fee_offsets"("fee_id");

-- CreateIndex
CREATE INDEX "clearer_fee_offsets_custody_id_idx" ON "clearer_fee_offsets"("custody_id");

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_extra_account_id_fkey" FOREIGN KEY ("extra_account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_offsets" ADD CONSTRAINT "clearer_fee_offsets_fee_id_fkey" FOREIGN KEY ("fee_id") REFERENCES "clearer_fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_offsets" ADD CONSTRAINT "clearer_fee_offsets_custody_id_fkey" FOREIGN KEY ("custody_id") REFERENCES "custodies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── checks the schema cannot say ─────────

-- a clearer keeps what is left of his custody; it comes off his fees
ALTER TABLE "custodies"
  ADD CONSTRAINT "custodies_kept" CHECK ("kept_amount" >= 0 AND ("kept_amount" = 0 OR "holder_type" = 'CLEARER')),
  ADD CONSTRAINT "custodies_extra_account" CHECK ("extra_account_id" IS NULL OR "extra_amount" > 0),
  ADD CONSTRAINT "custodies_extra_reference" CHECK (("extra_payment_method" IS NULL) = ("extra_reference" IS NULL));
ALTER TABLE "clearer_fee_offsets"
  ADD CONSTRAINT "clearer_fee_offsets_amount" CHECK ("amount" > 0);

-- the journal says what a clearer kept
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
                     || CASE WHEN c."kept_amount" > 0 THEN '، باقي اتخصم من الأتعاب ' || c."kept_amount" ELSE '' END
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

-- a settled custody: what was spent plus what came back or was kept equals what was given
ALTER TABLE "custodies" DROP CONSTRAINT "custodies_settlement";
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_settlement" CHECK (
    ("status" = 'OPEN' AND "spent_amount" = 0 AND "returned_amount" = 0 AND "extra_amount" = 0
       AND "kept_amount" = 0 AND "settlement_date" IS NULL AND "settled_by" IS NULL)
    OR ("status" = 'SETTLED' AND "settlement_date" IS NOT NULL AND "settled_by" IS NOT NULL
       AND "amount" + "extra_amount" - "spent_amount" = "returned_amount" + "kept_amount"
       AND ("returned_amount" + "kept_amount" = 0 OR "extra_amount" = 0)));
