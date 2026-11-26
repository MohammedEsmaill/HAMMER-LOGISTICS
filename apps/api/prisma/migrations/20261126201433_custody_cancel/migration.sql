-- AlterTable
ALTER TABLE "custodies" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by" INTEGER;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- a clearer's custody has no purpose: one custody for the clearer, that is all
UPDATE "custodies" SET "purpose" = NULL WHERE "holder_type" = 'CLEARER';
