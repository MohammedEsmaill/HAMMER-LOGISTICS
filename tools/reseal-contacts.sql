-- HAMMER LINE: when FIELD_ENCRYPTION_KEY was replaced after the national IDs and phones
-- were encrypted with the old one, takes them back in plain text from a backup made
-- before the encryption (restored in the database hammer_restore). The system then
-- encrypts them again with the current key when it starts.
-- Run through reseal-contacts.bat. Variable: restore (a dblink connection string).
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS dblink;

UPDATE "employees" e
   SET "national_id" = r.national_id, "phone" = r.phone, "national_id_hash" = NULL, "phone_hash" = NULL
  FROM dblink(:'restore', 'SELECT id, national_id, phone FROM employees')
       AS r(id int, national_id text, phone text)
 WHERE e."id" = r.id AND e."national_id" LIKE 'enc:%' AND r.national_id NOT LIKE 'enc:%';

UPDATE "clearers" c
   SET "national_id" = r.national_id, "phone" = r.phone, "national_id_hash" = NULL, "phone_hash" = NULL
  FROM dblink(:'restore', 'SELECT id, national_id, phone FROM clearers')
       AS r(id int, national_id text, phone text)
 WHERE c."id" = r.id AND c."national_id" LIKE 'enc:%' AND r.national_id NOT LIKE 'enc:%';

SELECT (SELECT count(*) FROM "employees" WHERE "national_id_hash" IS NULL AND "national_id" NOT LIKE 'enc:%') AS employees_back,
       (SELECT count(*) FROM "clearers" WHERE "national_id_hash" IS NULL AND "national_id" NOT LIKE 'enc:%') AS clearers_back,
       (SELECT count(*) FROM "employees" WHERE "national_id" LIKE 'enc:%')
     + (SELECT count(*) FROM "clearers" WHERE "national_id" LIKE 'enc:%') AS still_encrypted;
COMMIT;
