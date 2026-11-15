-- DropIndex
DROP INDEX "clients_export_reviewer_idx";

-- DropIndex
DROP INDEX "clients_import_reviewer_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_failed_at" TIMESTAMP(3),
ADD COLUMN     "lock_count" INTEGER NOT NULL DEFAULT 0;
