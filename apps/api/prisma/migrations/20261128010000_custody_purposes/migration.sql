-- A clearer's custody has no purpose any more; a transfer to a shipping line may carry
-- one (unloading, storage or release charges).
ALTER TABLE "custodies" DROP CONSTRAINT "custodies_holder";
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_holder" CHECK (
     ("holder_type" = 'AGENT' AND "agent_employee_id" IS NOT NULL AND "clearer_id" IS NULL
      AND "purpose" IN ('UNLOADING', 'RELEASE', 'STORAGE') AND "currency" = 'EGP')
  OR ("holder_type" = 'WAY_OUT' AND "agent_employee_id" IS NULL AND "clearer_id" IS NULL
      AND "purpose" IN ('UNLOADING', 'RELEASE', 'STORAGE') AND "currency" = 'USD')
  OR ("holder_type" = 'CLEARER' AND "clearer_id" IS NOT NULL AND "agent_employee_id" IS NULL
      AND "purpose" IS NULL AND "currency" = 'EGP')
  OR ("holder_type" = 'BANK_TRANSFER' AND "agent_employee_id" IS NULL AND "clearer_id" IS NULL
      AND ("purpose" IS NULL OR "purpose" IN ('UNLOADING', 'RELEASE', 'STORAGE')))
);
