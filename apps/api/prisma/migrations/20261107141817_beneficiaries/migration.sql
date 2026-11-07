-- CreateEnum
CREATE TYPE "BeneficiaryKind" AS ENUM ('SHIPPING_AGENCY', 'CLEARER', 'OTHER');

-- AlterTable
ALTER TABLE "clearer_fee_payments" ADD COLUMN     "beneficiary_id" INTEGER,
ADD COLUMN     "transfer_ref" TEXT;

-- AlterTable
ALTER TABLE "custodies" ADD COLUMN     "beneficiary_id" INTEGER,
ADD COLUMN     "transfer_ref" TEXT;

-- CreateTable
CREATE TABLE "beneficiaries" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BeneficiaryKind" NOT NULL,
    "clearer_id" INTEGER,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beneficiaries_bank_name_account_number_key" ON "beneficiaries"("bank_name", "account_number");

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearer_fee_payments" ADD CONSTRAINT "clearer_fee_payments_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_clearer_id_fkey" FOREIGN KEY ("clearer_id") REFERENCES "clearers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Business rules Prisma cannot express ─────

ALTER TABLE "beneficiaries"
  ADD CONSTRAINT "beneficiaries_clearer" CHECK (("kind" = 'CLEARER') = ("clearer_id" IS NOT NULL)),
  ADD CONSTRAINT "beneficiaries_name" CHECK (length(btrim("name")) >= 2),
  ADD CONSTRAINT "beneficiaries_account" CHECK ("account_number" ~ '^[A-Z0-9-]{4,34}$');

-- a bank-transfer custody always names the account it paid
ALTER TABLE "custodies"
  ADD CONSTRAINT "custodies_beneficiary" CHECK (("holder_type" = 'BANK_TRANSFER') = ("beneficiary_id" IS NOT NULL)),
  ADD CONSTRAINT "custodies_transfer_ref" CHECK ("transfer_ref" IS NULL OR "holder_type" = 'BANK_TRANSFER');

ALTER TABLE "clearer_fee_payments"
  ADD CONSTRAINT "clearer_fee_payments_transfer_ref" CHECK ("transfer_ref" IS NULL OR "beneficiary_id" IS NOT NULL);
