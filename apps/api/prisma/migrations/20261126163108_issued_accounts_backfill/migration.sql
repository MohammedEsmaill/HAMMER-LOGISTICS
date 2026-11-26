-- A finished account whose invoices still wait for approval is now "issued": it
-- finishes when the accounts manager approves them.
UPDATE "shipment_accounts" a
   SET "status" = 'ISSUED'
 WHERE a."status" = 'FINISHED'
   AND EXISTS (
     SELECT 1 FROM "invoices" i
      WHERE i."shipment_id" = a."shipment_id"
        AND i."voided_at" IS NULL
        AND i."approval_status" <> 'APPROVED');
