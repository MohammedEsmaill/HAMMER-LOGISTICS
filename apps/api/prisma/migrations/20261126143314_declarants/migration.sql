-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "declarant_id" INTEGER;

-- CreateTable
CREATE TABLE "declarants" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "declarants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "declarants_name_key" ON "declarants"("name");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_declarant_id_fkey" FOREIGN KEY ("declarant_id") REFERENCES "declarants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
