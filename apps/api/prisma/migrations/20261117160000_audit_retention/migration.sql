-- the audit log stays append-only, except that rows older than two years may be
-- removed (the daily cleanup); nothing newer can be changed or deleted
CREATE OR REPLACE FUNCTION "forbid_audit_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."created_at" < now() - interval '2 years' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only';
END $$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");
