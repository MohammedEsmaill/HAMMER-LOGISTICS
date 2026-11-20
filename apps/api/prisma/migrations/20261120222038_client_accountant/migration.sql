-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "accountant_employee_id" INTEGER;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_accountant_employee_id_fkey" FOREIGN KEY ("accountant_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
