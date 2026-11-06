-- AlterTable
ALTER TABLE "carriers" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 1000;

-- AlterTable
ALTER TABLE "storage_yards" ADD COLUMN     "port_id" INTEGER;

-- AddForeignKey
ALTER TABLE "storage_yards" ADD CONSTRAINT "storage_yards_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
