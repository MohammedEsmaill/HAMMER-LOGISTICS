-- Import shipments now go through nine stages, chosen from one list (Nafeza tab):
-- registered, arrived, DO collected, examination, valuation, approval pending,
-- approved, duties paid, cleared. Shipments resting on a stage that left the flow
-- move to its nearest stage. Their stage history keeps what really happened.
UPDATE "shipments" SET "current_stage" = 'REGISTERED', "version" = "version" + 1
 WHERE "direction" = 'IMPORT' AND "current_stage" = 'IN_TRANSIT';
UPDATE "shipments" SET "current_stage" = 'ARRIVED', "version" = "version" + 1
 WHERE "direction" = 'IMPORT' AND "current_stage" IN ('UNLOADING', 'UNLOADED', 'RECEIVED_AT_WAREHOUSE');
UPDATE "shipments" SET "current_stage" = 'DO_COLLECTED', "version" = "version" + 1
 WHERE "direction" = 'IMPORT' AND "mode" <> 'FREE_ZONE' AND "current_stage" = 'SUBMITTED';
-- a free-zone shipment has no delivery order: submitted means it is still before examination
UPDATE "shipments" SET "current_stage" = 'REGISTERED', "version" = "version" + 1
 WHERE "direction" = 'IMPORT' AND "mode" = 'FREE_ZONE' AND "current_stage" = 'SUBMITTED';
UPDATE "shipments" SET "current_stage" = 'EXAMINATION', "version" = "version" + 1
 WHERE "direction" = 'IMPORT' AND "current_stage" = 'INSPECTION';
UPDATE "shipments" SET "current_stage" = 'CLEARED', "version" = "version" + 1
 WHERE "direction" = 'IMPORT' AND "current_stage" = 'RELEASE_DELIVERED';
