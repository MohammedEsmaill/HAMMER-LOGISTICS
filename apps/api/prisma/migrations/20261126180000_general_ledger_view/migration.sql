-- The general ledger: every financial document as balanced debit / credit lines in its
-- own currency, computed from the documents' current state (an edit reverses and posts
-- again in the money ledger; the document itself always holds what stands). Account
-- keys: fixed ones (CUSTODY, RECEIVABLE, …), MA:<money account>, PARTY:<party>,
-- EXP:<expense category>. Charts and reports are built on top in the API.
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
)
SELECT * FROM legs WHERE debit <> 0 OR credit <> 0;
