-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('DOCUMENT', 'SETTLEMENT', 'RECEIPT');

-- AlterTable
ALTER TABLE "shipment_documents" ADD COLUMN     "category" "DocumentCategory" NOT NULL DEFAULT 'DOCUMENT';
