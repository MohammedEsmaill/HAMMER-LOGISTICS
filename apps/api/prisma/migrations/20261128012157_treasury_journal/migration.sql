-- AlterTable
ALTER TABLE "beneficiaries" ADD COLUMN     "currency" "Currency";

-- AlterTable
ALTER TABLE "employee_advances" ADD COLUMN     "payment_method" "BankPaymentMethod",
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "party_movements" ADD COLUMN     "personal_account_id" INTEGER;

-- AlterTable
ALTER TABLE "salary_payments" ADD COLUMN     "payment_method" "BankPaymentMethod",
ADD COLUMN     "reference" TEXT;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_personal_account_id_currency_fkey" FOREIGN KEY ("personal_account_id", "currency") REFERENCES "money_accounts"("id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- a party's bank account has its currency; the existing ones were all in pounds
UPDATE "beneficiaries" SET "currency" = 'EGP' WHERE "kind" = 'PARTY';
ALTER TABLE "beneficiaries"
  ADD CONSTRAINT "beneficiaries_currency" CHECK (("kind"::text = 'PARTY') = ("currency" IS NOT NULL));
-- a payment goes into the party's bank account or the owner's personal account, not both
ALTER TABLE "party_movements"
  ADD CONSTRAINT "party_movements_personal" CHECK ("personal_account_id" IS NULL OR ("kind" = 'PAYMENT' AND "beneficiary_id" IS NULL));
-- a salary or an advance from a bank goes by transfer, with its reference
ALTER TABLE "salary_payments"
  ADD CONSTRAINT "salary_payments_method" CHECK ("payment_method" IS NULL OR ("payment_method" = 'TRANSFER' AND "reference" IS NOT NULL));
ALTER TABLE "employee_advances"
  ADD CONSTRAINT "employee_advances_method" CHECK ("payment_method" IS NULL OR ("payment_method" = 'TRANSFER' AND "reference" IS NOT NULL));

-- the journal shows a salary/advance transfer reference and the account a party was paid into
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
         concat_ws(' · ', 'مرتب ' || to_char(s."salary_month", 'YYYY-MM'), 'تحويل ' || s."reference", s."notes"),
         s."approval_status"::text, s."created_by", s."created_at", true
    FROM "salary_payments" s JOIN "employees" e ON e."id" = s."employee_id"
  UNION ALL
  SELECT 'ADVANCE', v."id", 'AD-' || v."id", v."advance_date", v."currency"::text, v."amount",
         'OUT', v."account_id", NULL, e."full_name", NULL,
         concat_ws(' · ', 'سلفة', 'تحويل ' || v."reference", v."notes"),
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
           p."payee", (SELECT 'على ' || pa."name" FROM "money_accounts" pa WHERE pa."id" = p."personal_account_id"),
           (SELECT 'على ' || b."bank_name" FROM "beneficiaries" b WHERE b."id" = p."beneficiary_id"), CASE WHEN p."reference" IS NOT NULL THEN (CASE p."payment_method" WHEN 'CHEQUE' THEN 'شيك ' WHEN 'TRANSFER' THEN 'تحويل ' ELSE 'مرجع ' END) || p."reference" END,
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
