-- AlterEnum

-- AlterTable
ALTER TABLE "beneficiaries" ADD COLUMN     "party_id" INTEGER;

-- AlterTable
ALTER TABLE "party_movements" ADD COLUMN     "beneficiary_id" INTEGER;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "internal_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_movements" ADD CONSTRAINT "party_movements_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- a party's account belongs to its party, and only it has one
ALTER TABLE "beneficiaries"
  ADD CONSTRAINT "beneficiaries_party" CHECK (("kind"::text = 'PARTY') = ("party_id" IS NOT NULL));
-- a party movement's account is the party's own, for a payment only
ALTER TABLE "party_movements"
  ADD CONSTRAINT "party_movements_beneficiary" CHECK ("beneficiary_id" IS NULL OR "kind" = 'PAYMENT');
