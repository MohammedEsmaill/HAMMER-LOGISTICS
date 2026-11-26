-- AlterEnum
ALTER TYPE "ShipmentAccountStatus" ADD VALUE 'ISSUED' BEFORE 'FINISHED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signature" TEXT,
ADD COLUMN     "signature_at" TIMESTAMP(3);
