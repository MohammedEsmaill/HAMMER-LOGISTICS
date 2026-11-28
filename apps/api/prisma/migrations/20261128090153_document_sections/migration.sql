-- The shipment's documents go in four sections; the ones uploaded before (document /
-- settlement / receipt) all go in «الصور الضوئية», to be moved by hand where they belong.
CREATE TYPE "DocumentSection" AS ENUM ('SHIPPING_AGENCY', 'CUSTOMS', 'TRANSPORT', 'SCANS');

ALTER TABLE "shipment_documents" ADD COLUMN "section" "DocumentSection" NOT NULL DEFAULT 'SCANS';
ALTER TABLE "shipment_documents" ALTER COLUMN "section" DROP DEFAULT;
ALTER TABLE "shipment_documents" DROP COLUMN "category";
DROP TYPE "DocumentCategory";

-- Every file keeps a copy on this server's disk. The ones already on it are their own
-- copy (public_id local:<key>), and go up to Cloudinary once it is configured.
ALTER TABLE "shipment_documents" ADD COLUMN "local_key" TEXT;
ALTER TABLE "party_documents" ADD COLUMN "local_key" TEXT;
UPDATE "shipment_documents" SET "local_key" = substr("public_id", 7) WHERE "public_id" LIKE 'local:%';
UPDATE "party_documents" SET "local_key" = substr("public_id", 7) WHERE "public_id" LIKE 'local:%';
