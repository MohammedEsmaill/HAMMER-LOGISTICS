-- AlterEnum
ALTER TYPE "InboxKind" ADD VALUE 'DOCUMENT_EXPIRY';

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'DOCUMENT_EXPIRY';

-- CreateTable
CREATE TABLE "party_document_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "party_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_documents" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "factory_id" INTEGER,
    "type_id" INTEGER NOT NULL,
    "title" TEXT,
    "number" TEXT,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "notes" TEXT,
    "file_name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "party_document_types_name_key" ON "party_document_types"("name");

-- CreateIndex
CREATE INDEX "party_documents_client_id_idx" ON "party_documents"("client_id");

-- CreateIndex
CREATE INDEX "party_documents_expiry_date_idx" ON "party_documents"("expiry_date");

-- AddForeignKey
ALTER TABLE "party_documents" ADD CONSTRAINT "party_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_documents" ADD CONSTRAINT "party_documents_factory_id_client_id_fkey" FOREIGN KEY ("factory_id", "client_id") REFERENCES "factories"("id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_documents" ADD CONSTRAINT "party_documents_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "party_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_documents" ADD CONSTRAINT "party_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_documents" ADD CONSTRAINT "party_documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "party_documents"
  ADD CONSTRAINT "party_documents_dates" CHECK ("expiry_date" >= "issue_date"),
  ADD CONSTRAINT "party_documents_size" CHECK ("size" > 0);

INSERT INTO "party_document_types" ("name") VALUES
  ('السجل التجاري'), ('البطاقة الضريبية'), ('بطاقة قيد مستوردين'), ('سجل المصدرين'),
  ('شهادة ضريبة القيمة المضافة'), ('التوكيل الجمركي'), ('السجل الصناعي / رخصة التشغيل'),
  ('ترخيص المنطقة الحرة'), ('خطاب تحديث وضمان'), ('شهادة استيراد'), ('أخرى')
ON CONFLICT DO NOTHING;
