-- DropIndex
DROP INDEX "users_clearer_id_key";

-- DropIndex
DROP INDEX "users_employee_id_key";

-- An employee or clearer has at most one account that is not soft-deleted,
-- so a new account can be opened after the old one is deleted.
CREATE UNIQUE INDEX "users_employee_id_active_key" ON "users" ("employee_id") WHERE "deleted_at" IS NULL AND "employee_id" IS NOT NULL;
CREATE UNIQUE INDEX "users_clearer_id_active_key"  ON "users" ("clearer_id")  WHERE "deleted_at" IS NULL AND "clearer_id"  IS NOT NULL;
