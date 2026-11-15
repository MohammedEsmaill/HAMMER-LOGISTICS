-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "export_reviewer_employee_id" INTEGER,
ADD COLUMN     "import_reviewer_employee_id" INTEGER;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_import_reviewer_employee_id_fkey" FOREIGN KEY ("import_reviewer_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_export_reviewer_employee_id_fkey" FOREIGN KEY ("export_reviewer_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- a reviewer is someone other than the client's operation employee, and an export
-- reviewer needs an export operation employee
ALTER TABLE "clients"
  ADD CONSTRAINT "clients_import_reviewer_differs" CHECK ("import_reviewer_employee_id" IS NULL OR "import_reviewer_employee_id" <> "import_operation_employee_id"),
  ADD CONSTRAINT "clients_export_reviewer" CHECK ("export_reviewer_employee_id" IS NULL
    OR ("export_operation_employee_id" IS NOT NULL AND "export_reviewer_employee_id" <> "export_operation_employee_id"));
CREATE INDEX "clients_import_reviewer_idx" ON "clients" ("import_reviewer_employee_id");
CREATE INDEX "clients_export_reviewer_idx" ON "clients" ("export_reviewer_employee_id");
