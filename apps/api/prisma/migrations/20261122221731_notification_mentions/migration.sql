-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];
