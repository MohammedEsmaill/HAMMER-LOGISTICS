-- The approval cycle changed in November 2026: the general auditor reviews, the
-- accounts manager approves. Documents caught halfway through the old cycle (approved
-- by the accounts manager as its middle step, or reviewed by someone who no longer
-- reviews: the accountant) start the new cycle again: back to pending, the old steps
-- cleared. What happened before stays in the audit log (action APPROVAL_RESET).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transfers', 'other_movements', 'salary_payments', 'employee_advances', 'general_expenses',
    'custodies', 'clearer_fee_adjustments', 'clearer_fee_payments', 'invoices', 'collections',
    'party_movements', 'asset_transactions'
  ] LOOP
    EXECUTE format($q$
      WITH old AS (
        SELECT d."id", d."approval_status", d."reviewed_by", d."reviewed_at", d."manager_by", d."manager_at"
          FROM %1$I d
         WHERE d."approval_status" = 'MANAGER_APPROVED'
            OR (d."approval_status" = 'REVIEWED' AND NOT EXISTS (
                  SELECT 1 FROM "users" u
                    JOIN "roles" r ON r."id" = u."role_id"
                                   OR r."id" IN (SELECT x."role_id" FROM "user_extra_roles" x WHERE x."user_id" = u."id")
                   WHERE u."id" = d."reviewed_by"
                     AND (r."is_system" OR 'finance.review' = ANY (r."permissions"))))
         FOR UPDATE
      ), reset AS (
        UPDATE %1$I d
           SET "approval_status" = 'PENDING', "reviewed_by" = NULL, "reviewed_at" = NULL,
               "manager_by" = NULL, "manager_at" = NULL, "version" = d."version" + 1
          FROM old WHERE d."id" = old."id"
        RETURNING d."id"
      )
      INSERT INTO "audit_logs" ("user_id", "action", "entity", "entity_id", "before", "after")
      SELECT NULL, 'APPROVAL_RESET', %1$L, old."id"::text,
             jsonb_build_object('approvalStatus', old."approval_status", 'reviewedById', old."reviewed_by",
                                'reviewedAt', old."reviewed_at", 'managerById', old."manager_by", 'managerAt', old."manager_at"),
             jsonb_build_object('approvalStatus', 'PENDING', 'reason', 'دورة الاعتماد الجديدة: المراجع العام ثم مدير الحسابات')
        FROM old JOIN reset ON reset."id" = old."id"
    $q$, t);
  END LOOP;
END $$;
