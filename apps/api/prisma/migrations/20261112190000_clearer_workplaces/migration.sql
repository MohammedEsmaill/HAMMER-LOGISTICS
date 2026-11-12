-- جهة التخليص: a clearer's ports / airports and free zones, chosen from the lookups
-- instead of typed text. Typed names that match an Egyptian port or a free zone move
-- over; the others are kept in the clearer's notes.

CREATE TABLE "clearer_ports" (
    "clearer_id" INTEGER NOT NULL,
    "port_id" INTEGER NOT NULL,
    CONSTRAINT "clearer_ports_pkey" PRIMARY KEY ("clearer_id","port_id")
);
CREATE INDEX "clearer_ports_port_id_idx" ON "clearer_ports"("port_id");
ALTER TABLE "clearer_ports" ADD CONSTRAINT "clearer_ports_clearer_id_fkey" FOREIGN KEY ("clearer_id") REFERENCES "clearers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clearer_ports" ADD CONSTRAINT "clearer_ports_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clearer_free_zones" (
    "clearer_id" INTEGER NOT NULL,
    "free_zone_id" INTEGER NOT NULL,
    CONSTRAINT "clearer_free_zones_pkey" PRIMARY KEY ("clearer_id","free_zone_id")
);
CREATE INDEX "clearer_free_zones_free_zone_id_idx" ON "clearer_free_zones"("free_zone_id");
ALTER TABLE "clearer_free_zones" ADD CONSTRAINT "clearer_free_zones_clearer_id_fkey" FOREIGN KEY ("clearer_id") REFERENCES "clearers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clearer_free_zones" ADD CONSTRAINT "clearer_free_zones_free_zone_id_fkey" FOREIGN KEY ("free_zone_id") REFERENCES "free_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Arabic names the office types for the Egyptian ports (named in English in the lookups)
CREATE TEMP TABLE "port_words" ("word" TEXT, "code" TEXT) ON COMMIT DROP;
INSERT INTO "port_words" VALUES
  ('الإسكندرية', 'EGALY'), ('الاسكندرية', 'EGALY'), ('اسكندرية', 'EGALY'), ('إسكندرية', 'EGALY'),
  ('الدخيلة', 'EGEDK'), ('دخيلة', 'EGEDK'),
  ('دمياط', 'EGDAM'), ('بورسعيد', 'EGPSD'), ('بور سعيد', 'EGPSD'),
  ('السخنة', 'EGSOK'), ('سخنة', 'EGSOK'),
  ('مطار القاهرة', 'CAI'), ('برج العرب', 'HBE'), ('سفنكس', 'SPX');

-- the typed names that match: the port's name, or an Arabic name inside the text
INSERT INTO "clearer_ports" ("clearer_id", "port_id")
SELECT DISTINCT c."id", p."id"
  FROM "clearers" c, unnest(c."customs_offices") AS o(name), "ports" p
 WHERE p."is_egyptian"
   AND (lower(trim(p."name")) = lower(trim(o.name))
        OR EXISTS (SELECT 1 FROM "port_words" w WHERE w."code" = p."code" AND o.name LIKE '%' || w."word" || '%'));

INSERT INTO "clearer_free_zones" ("clearer_id", "free_zone_id")
SELECT DISTINCT c."id", z."id"
  FROM "clearers" c, unnest(c."customs_offices") AS o(name)
  JOIN "free_zones" z ON trim(z."name") = trim(o.name);

-- the rest stays readable in the notes
UPDATE "clearers" c
   SET "notes" = concat_ws(E'\n', nullif(c."notes", ''), 'جهات التخليص (قبل التحديث): ' || rest.names)
  FROM (
    SELECT c2."id", string_agg(trim(o.name), '، ') AS names
      FROM "clearers" c2, unnest(c2."customs_offices") AS o(name)
     WHERE NOT EXISTS (SELECT 1 FROM "ports" p WHERE p."is_egyptian" AND lower(trim(p."name")) = lower(trim(o.name)))
       AND NOT EXISTS (SELECT 1 FROM "port_words" w WHERE o.name LIKE '%' || w."word" || '%')
       AND NOT EXISTS (SELECT 1 FROM "free_zones" z WHERE trim(z."name") = trim(o.name))
       AND trim(o.name) <> ''
     GROUP BY c2."id"
  ) rest
 WHERE rest."id" = c."id";

ALTER TABLE "clearers" DROP COLUMN "customs_offices";
