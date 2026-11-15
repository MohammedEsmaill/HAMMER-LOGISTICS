-- voyage and booking numbers became optional; a free-zone shipment still has none
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_free_zone_fields";
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_free_zone_fields" CHECK (
  ("mode" = 'FREE_ZONE' AND "free_zone_id" IS NOT NULL AND "carrier_id" IS NULL AND "reference_number" IS NULL
     AND "loading_port_id" IS NULL AND "discharge_port_id" IS NULL AND "hbl_number" IS NULL AND "mbl_number" IS NULL
     AND "load_type" IS NULL AND "containers_count" IS NULL)
  OR ("mode" <> 'FREE_ZONE' AND "free_zone_id" IS NULL AND "carrier_id" IS NOT NULL AND "reference_number" IS NOT NULL
     AND "loading_port_id" IS NOT NULL AND "discharge_port_id" IS NOT NULL));
