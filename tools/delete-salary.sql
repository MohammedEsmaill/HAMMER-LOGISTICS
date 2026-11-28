-- HAMMER LINE: deletes one salary still under review (PENDING), with its lines in the
-- money ledger, and puts the cash box / bank balances back as if it never was.
-- Run through delete-salary.bat (it takes a backup first). Variables: code, month (YYYY-MM).
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE target ON COMMIT DROP AS
  SELECT s."id", s."net", e."full_name"
    FROM "salary_payments" s JOIN "employees" e ON e."id" = s."employee_id"
   WHERE e."code" = :'code' AND s."salary_month" = (:'month' || '-01')::date;

DO $$
BEGIN
  IF (SELECT count(*) FROM target) <> 1 THEN
    RAISE EXCEPTION 'No salary for this employee code and month';
  END IF;
  IF EXISTS (SELECT 1 FROM "salary_payments" s JOIN target t ON t."id" = s."id" WHERE s."approval_status" <> 'PENDING') THEN
    RAISE EXCEPTION 'The salary was already reviewed or approved: it cannot be deleted';
  END IF;
END $$;

-- the salary's ledger lines; "fix" is what each one took from the balance
CREATE TEMP TABLE gone ON COMMIT DROP AS
  SELECT m."id", m."account_id", m."movement_date", m."direction", m."amount",
         CASE WHEN m."direction" = 'IN' THEN -m."amount" ELSE m."amount" END AS fix
    FROM "money_movements" m
   WHERE m."salary_id" IN (SELECT "id" FROM target);

-- the books must add up before we touch them
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "money_accounts" a
     WHERE a."id" IN (SELECT "account_id" FROM gone)
       AND a."balance" <> a."opening_balance" + coalesce((
             SELECT sum(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END)
               FROM "money_movements" m WHERE m."account_id" = a."id"), 0)) THEN
    RAISE EXCEPTION 'An account balance does not match its ledger: stopped, nothing changed';
  END IF;
END $$;

ALTER TABLE "money_movements" DISABLE TRIGGER "money_movements_append_only";

-- the lines after it carry a running balance short by what it took
UPDATE "money_movements" m
   SET "balance_after" = m."balance_after" + (
         SELECT sum(g.fix) FROM gone g WHERE g."account_id" = m."account_id" AND g."id" < m."id")
 WHERE m."id" NOT IN (SELECT "id" FROM gone)
   AND EXISTS (SELECT 1 FROM gone g WHERE g."account_id" = m."account_id" AND g."id" < m."id");

DELETE FROM "money_movements" WHERE "id" IN (SELECT "id" FROM gone) AND "reversal_of_id" IS NOT NULL;
DELETE FROM "money_movements" WHERE "id" IN (SELECT "id" FROM gone);

ALTER TABLE "money_movements" ENABLE TRIGGER "money_movements_append_only";

UPDATE "money_accounts" a
   SET "balance" = a."balance" + (SELECT sum(g.fix) FROM gone g WHERE g."account_id" = a."id")
 WHERE a."id" IN (SELECT "account_id" FROM gone);

-- the closed days' figures from that day on
UPDATE "journal_day_accounts" d
   SET "opening" = d."opening" + coalesce((SELECT sum(g.fix) FROM gone g WHERE g."account_id" = d."account_id" AND g."movement_date" < d."date"), 0),
       "in"      = d."in"  - coalesce((SELECT sum(g."amount") FROM gone g WHERE g."account_id" = d."account_id" AND g."movement_date" = d."date" AND g."direction" = 'IN'), 0),
       "out"     = d."out" - coalesce((SELECT sum(g."amount") FROM gone g WHERE g."account_id" = d."account_id" AND g."movement_date" = d."date" AND g."direction" = 'OUT'), 0),
       "closing" = d."closing" + coalesce((SELECT sum(g.fix) FROM gone g WHERE g."account_id" = d."account_id" AND g."movement_date" <= d."date"), 0)
 WHERE d."account_id" IN (SELECT "account_id" FROM gone)
   AND d."date" >= (SELECT min(g."movement_date") FROM gone g WHERE g."account_id" = d."account_id");

DELETE FROM "salary_payments" WHERE "id" IN (SELECT "id" FROM target);

-- and add up after
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "money_accounts" a
     WHERE a."id" IN (SELECT "account_id" FROM gone)
       AND (a."balance" <> a."opening_balance" + coalesce((
              SELECT sum(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END)
                FROM "money_movements" m WHERE m."account_id" = a."id"), 0)
         OR a."balance" <> coalesce((SELECT m."balance_after" FROM "money_movements" m
                                      WHERE m."account_id" = a."id" ORDER BY m."id" DESC LIMIT 1), a."opening_balance"))) THEN
    RAISE EXCEPTION 'The balances do not add up after the delete: stopped, nothing changed';
  END IF;
END $$;

SELECT 'Deleted the salary of ' || t."full_name" || ' (' || t."net" || ' EGP), and returned it to the balance' AS done FROM target t;
COMMIT;
