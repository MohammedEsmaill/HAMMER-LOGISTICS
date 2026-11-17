-- CreateEnum
CREATE TYPE "InboxKind" AS ENUM ('SHIPMENT_NEW', 'SHIPMENT_ETA', 'SHIPMENT_STUCK');

-- CreateTable
CREATE TABLE "inbox_items" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" "InboxKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "shipment_id" INTEGER,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_items_user_id_id_idx" ON "inbox_items"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_items_user_id_dedupe_key_key" ON "inbox_items"("user_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
