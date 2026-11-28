-- AlterTable
ALTER TABLE "clearers" ADD COLUMN     "national_id_hash" TEXT,
ADD COLUMN     "phone_hash" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "national_id_hash" TEXT,
ADD COLUMN     "phone_hash" TEXT;

-- National IDs and phones are now kept encrypted (by the app, which holds the key): a
-- plain-text index or format check no longer applies. Uniqueness moves to keyed hashes,
-- which the app fills for the existing rows when it starts.
DROP INDEX IF EXISTS "employees_national_id_active_key";
DROP INDEX IF EXISTS "clearers_national_id_active_key";
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_national_id_format";
ALTER TABLE "clearers" DROP CONSTRAINT IF EXISTS "clearers_national_id_format";
CREATE UNIQUE INDEX "employees_national_id_hash_key" ON "employees" ("national_id_hash") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "employees_phone_hash_key" ON "employees" ("phone_hash") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "clearers_national_id_hash_key" ON "clearers" ("national_id_hash") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "clearers_phone_hash_key" ON "clearers" ("phone_hash") WHERE "deleted_at" IS NULL;

-- The login session id is kept as its sha256 (the token carries the plain one), so the
-- current sessions carry on.
UPDATE "users" SET "session_id" = encode(sha256(convert_to("session_id", 'UTF8')), 'hex') WHERE "session_id" IS NOT NULL;

-- The audit log no longer keeps national IDs or phones in plain text (the log is
-- append-only: its guard is lifted for this one change only).
ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_append_only";
UPDATE "audit_logs" SET "before" = jsonb_set("before", '{nationalId}', '"***"')
 WHERE "before" IS NOT NULL AND "before" ? 'nationalId';
UPDATE "audit_logs" SET "after" = jsonb_set("after", '{nationalId}', '"***"')
 WHERE "after" IS NOT NULL AND "after" ? 'nationalId';
UPDATE "audit_logs" SET "before" = jsonb_set("before", '{phone}', '"***"')
 WHERE "before" IS NOT NULL AND "before" ? 'phone' AND "entity" IN ('employee', 'clearer', 'user');
UPDATE "audit_logs" SET "after" = jsonb_set("after", '{phone}', '"***"')
 WHERE "after" IS NOT NULL AND "after" ? 'phone' AND "entity" IN ('employee', 'clearer', 'user');
ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_append_only";
