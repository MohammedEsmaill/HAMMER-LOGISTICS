/*
  Warnings:

  - You are about to drop the column `signature` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `signature_at` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "signature",
DROP COLUMN "signature_at",
ADD COLUMN     "signature_name" TEXT;
