-- CreateEnum
CREATE TYPE "Department" AS ENUM ('MANAGEMENT', 'SCAN', 'OPERATION', 'NAFEZA', 'ACCOUNTS', 'AGENTS');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('EMPLOYEE', 'CLEARER');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "ShipmentMode" AS ENUM ('SEA', 'AIR', 'FREE_ZONE');

-- CreateEnum
CREATE TYPE "CustomsRegime" AS ENUM ('FINAL', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "LoadType" AS ENUM ('FCL', 'LCL');

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('HQ20', 'HQ40', 'LCL');

-- CreateEnum
CREATE TYPE "TransportKind" AS ENUM ('SEA', 'AIR');

-- CreateEnum
CREATE TYPE "ShipmentStage" AS ENUM ('REGISTERED', 'IN_TRANSIT', 'ARRIVED', 'UNLOADING', 'UNLOADED', 'RECEIVED_AT_WAREHOUSE', 'DO_COLLECTED', 'SUBMITTED', 'EXAMINATION', 'INSPECTION', 'VALUATION', 'APPROVAL_PENDING', 'APPROVED', 'DUTIES_PAID', 'RELEASE_DELIVERED', 'CLEARED', 'DELIVERED_TO_PORT', 'RELEASE_RECEIVED', 'SHIPPED', 'ARRIVED_DESTINATION', 'DELIVERED_TO_IMPORTER');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "national_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "department" "Department" NOT NULL,
    "job_title" TEXT NOT NULL,
    "hire_date" DATE NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "leave_date" DATE,
    "basic_salary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearers" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "national_id" TEXT NOT NULL,
    "customs_offices" TEXT[],
    "import_final_base" DECIMAL(14,2) NOT NULL,
    "import_temporary_base" DECIMAL(14,2) NOT NULL,
    "import_extra_container" DECIMAL(14,2) NOT NULL,
    "export_base" DECIMAL(14,2) NOT NULL,
    "export_extra_container" DECIMAL(14,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "clearers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "account_type" "AccountType" NOT NULL,
    "employee_id" INTEGER,
    "clearer_id" INTEGER,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "session_id" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_logs" (
    "id" SERIAL NOT NULL,
    "device_sn" TEXT NOT NULL,
    "employee_code" TEXT NOT NULL,
    "employee_id" INTEGER,
    "punched_at" TIMESTAMP(3) NOT NULL,
    "punch_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "import_operation_employee_id" INTEGER NOT NULL,
    "export_operation_employee_id" INTEGER,
    "quote_final_base" DECIMAL(14,2) NOT NULL,
    "quote_temporary_base" DECIMAL(14,2) NOT NULL,
    "quote_import_extra_container" DECIMAL(14,2) NOT NULL,
    "quote_export_base" DECIMAL(14,2) NOT NULL,
    "quote_export_extra_container" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factories" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tax_number" TEXT NOT NULL,
    "commercial_register" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "factories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ports" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "kind" "TransportKind" NOT NULL,
    "country_id" INTEGER NOT NULL,
    "is_egyptian" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carriers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TransportKind" NOT NULL,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_zones" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "free_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_yards" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TransportKind" NOT NULL,

    CONSTRAINT "storage_yards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_authorities" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "inspection_authorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" SERIAL NOT NULL,
    "file_no" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "mode" "ShipmentMode" NOT NULL,
    "client_id" INTEGER NOT NULL,
    "factory_id" INTEGER NOT NULL,
    "clearer_id" INTEGER NOT NULL,
    "operation_employee_id" INTEGER NOT NULL,
    "foreign_party_name" TEXT NOT NULL,
    "country_id" INTEGER NOT NULL,
    "consignee" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "customs_regime" "CustomsRegime",
    "packages_count" INTEGER NOT NULL,
    "total_weight" DECIMAL(14,3) NOT NULL,
    "notification_date" DATE NOT NULL,
    "carrier_id" INTEGER,
    "hbl_number" TEXT,
    "mbl_number" TEXT,
    "reference_number" TEXT,
    "voyage_no" TEXT,
    "booking_no" TEXT,
    "loading_port_id" INTEGER,
    "discharge_port_id" INTEGER,
    "free_zone_id" INTEGER,
    "load_type" "LoadType",
    "containers_count" INTEGER,
    "vessel_name" TEXT,
    "eta" DATE,
    "certificate_no" TEXT,
    "certificate_date" DATE,
    "delivery_order_date" DATE,
    "form46_date" DATE,
    "storage_yard_id" INTEGER,
    "examination_date" DATE,
    "inspection_date" DATE,
    "approval_date" DATE,
    "payment_date" DATE,
    "release_date" DATE,
    "delivered_to_port_date" DATE,
    "release_received_date" DATE,
    "shipped_date" DATE,
    "current_stage" "ShipmentStage" NOT NULL DEFAULT 'REGISTERED',
    "stage_history" JSONB NOT NULL DEFAULT '[]',
    "inspections" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_containers" (
    "id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "container_no" TEXT,
    "type" "ContainerType" NOT NULL,
    "weight" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "shipment_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_numbers" (
    "number" TEXT NOT NULL,
    "shipment_id" INTEGER NOT NULL,

    CONSTRAINT "bill_numbers_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "shipment_documents" (
    "id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,

    CONSTRAINT "shipment_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "employees_department_status_idx" ON "employees"("department", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_clearer_id_key" ON "users"("clearer_id");

-- CreateIndex
CREATE INDEX "attendance_logs_employee_id_punched_at_idx" ON "attendance_logs"("employee_id", "punched_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_logs_device_sn_employee_code_punched_at_key" ON "attendance_logs"("device_sn", "employee_code", "punched_at");

-- CreateIndex
CREATE INDEX "factories_client_id_idx" ON "factories"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "factories_id_client_id_key" ON "factories"("id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ports_code_key" ON "ports"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ports_kind_name_key" ON "ports"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "carriers_kind_name_key" ON "carriers"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "free_zones_name_key" ON "free_zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "storage_yards_kind_name_key" ON "storage_yards"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_authorities_name_key" ON "inspection_authorities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_file_no_key" ON "shipments"("file_no");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_reference_number_key" ON "shipments"("reference_number");

-- CreateIndex
CREATE INDEX "shipments_client_id_idx" ON "shipments"("client_id");

-- CreateIndex
CREATE INDEX "shipments_operation_employee_id_idx" ON "shipments"("operation_employee_id");

-- CreateIndex
CREATE INDEX "shipments_clearer_id_idx" ON "shipments"("clearer_id");

-- CreateIndex
CREATE INDEX "shipments_current_stage_idx" ON "shipments"("current_stage");

-- CreateIndex
CREATE INDEX "shipment_containers_container_no_idx" ON "shipment_containers"("container_no");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_containers_shipment_id_seq_key" ON "shipment_containers"("shipment_id", "seq");

-- CreateIndex
CREATE INDEX "bill_numbers_shipment_id_idx" ON "bill_numbers"("shipment_id");

-- CreateIndex
CREATE INDEX "shipment_documents_shipment_id_idx" ON "shipment_documents"("shipment_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearers" ADD CONSTRAINT "clearers_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_clearer_id_fkey" FOREIGN KEY ("clearer_id") REFERENCES "clearers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_import_operation_employee_id_fkey" FOREIGN KEY ("import_operation_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_export_operation_employee_id_fkey" FOREIGN KEY ("export_operation_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factories" ADD CONSTRAINT "factories_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factories" ADD CONSTRAINT "factories_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ports" ADD CONSTRAINT "ports_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_factory_id_client_id_fkey" FOREIGN KEY ("factory_id", "client_id") REFERENCES "factories"("id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_clearer_id_fkey" FOREIGN KEY ("clearer_id") REFERENCES "clearers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_operation_employee_id_fkey" FOREIGN KEY ("operation_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_loading_port_id_fkey" FOREIGN KEY ("loading_port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_discharge_port_id_fkey" FOREIGN KEY ("discharge_port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_free_zone_id_fkey" FOREIGN KEY ("free_zone_id") REFERENCES "free_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_storage_yard_id_fkey" FOREIGN KEY ("storage_yard_id") REFERENCES "storage_yards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_containers" ADD CONSTRAINT "shipment_containers_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_numbers" ADD CONSTRAINT "bill_numbers_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════
-- Business rules Prisma cannot express (kept in the DB as the last line of defence)
-- ════════════════════════════════════════════════════════════════════

-- Partial unique indexes: uniqueness only among rows that are not soft-deleted
CREATE UNIQUE INDEX "employees_code_active_key"        ON "employees" ("code")         WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "employees_national_id_active_key" ON "employees" ("national_id")  WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "clearers_national_id_active_key"  ON "clearers"  ("national_id")  WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_email_active_key"           ON "users"     (lower("email")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "clients_name_active_key"          ON "clients"   (lower("name"))  WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "factories_tax_number_active_key"  ON "factories" ("tax_number")   WHERE "deleted_at" IS NULL;

-- People
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_national_id_format" CHECK ("national_id" ~ '^[0-9]{14}$'),
  ADD CONSTRAINT "employees_leave_date"         CHECK ("status" <> 'LEFT' OR "leave_date" IS NOT NULL),
  ADD CONSTRAINT "employees_salary_positive"    CHECK ("basic_salary" >= 0);

ALTER TABLE "clearers"
  ADD CONSTRAINT "clearers_national_id_format" CHECK ("national_id" ~ '^[0-9]{14}$'),
  ADD CONSTRAINT "clearers_prices_positive"    CHECK ("import_final_base" >= 0 AND "import_temporary_base" >= 0
                                                  AND "import_extra_container" >= 0 AND "export_base" >= 0
                                                  AND "export_extra_container" >= 0);

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_domain" CHECK (lower("email") ~ '^[a-z0-9._%+-]+@hammerline\.com$'),
  ADD CONSTRAINT "users_account_owner" CHECK (
    ("account_type" = 'EMPLOYEE' AND "employee_id" IS NOT NULL AND "clearer_id" IS NULL) OR
    ("account_type" = 'CLEARER'  AND "clearer_id"  IS NOT NULL AND "employee_id" IS NULL));

-- Clients & factories
ALTER TABLE "clients"
  ADD CONSTRAINT "clients_mobile_format"    CHECK ("mobile" ~ '^01[0125][0-9]{8}$'),
  ADD CONSTRAINT "clients_quote_positive"   CHECK ("quote_final_base" >= 0 AND "quote_temporary_base" >= 0
                                               AND "quote_import_extra_container" >= 0 AND "quote_export_base" >= 0
                                               AND "quote_export_extra_container" >= 0);

ALTER TABLE "factories"
  ADD CONSTRAINT "factories_tax_number_format" CHECK ("tax_number" ~ '^[0-9]{9}$');

-- Shipments: what each type must and must not carry
ALTER TABLE "shipments"
  ADD CONSTRAINT "shipments_file_no_format"   CHECK ("file_no" ~ '^HL[0-9]{2}-[0-9]{4}$'),
  ADD CONSTRAINT "shipments_reference_format" CHECK ("reference_number" IS NULL OR "reference_number" ~ '^[0-9]{19}$'),
  ADD CONSTRAINT "shipments_commodity"        CHECK (length(trim("commodity")) > 0),
  ADD CONSTRAINT "shipments_positive"         CHECK ("packages_count" > 0 AND "total_weight" >= 0),
  ADD CONSTRAINT "shipments_free_zone_import" CHECK ("mode" <> 'FREE_ZONE' OR "direction" = 'IMPORT'),
  ADD CONSTRAINT "shipments_regime"           CHECK (("direction" = 'IMPORT') = ("customs_regime" IS NOT NULL)),
  ADD CONSTRAINT "shipments_free_zone_fields" CHECK (
    ("mode" = 'FREE_ZONE' AND "free_zone_id" IS NOT NULL AND "carrier_id" IS NULL AND "reference_number" IS NULL
       AND "loading_port_id" IS NULL AND "discharge_port_id" IS NULL AND "hbl_number" IS NULL AND "mbl_number" IS NULL
       AND "load_type" IS NULL AND "containers_count" IS NULL)
    OR ("mode" <> 'FREE_ZONE' AND "free_zone_id" IS NULL AND "carrier_id" IS NOT NULL AND "reference_number" IS NOT NULL
       AND "loading_port_id" IS NOT NULL AND "discharge_port_id" IS NOT NULL
       AND "voyage_no" IS NOT NULL AND "booking_no" IS NOT NULL)),
  ADD CONSTRAINT "shipments_import_bill"      CHECK ("direction" <> 'IMPORT' OR "mode" = 'FREE_ZONE' OR "mbl_number" IS NOT NULL),
  ADD CONSTRAINT "shipments_containers"       CHECK (
    ("mode" = 'SEA' AND "load_type" IS NOT NULL AND "containers_count" BETWEEN 1 AND 10
       AND ("load_type" <> 'LCL' OR "containers_count" = 1))
    OR ("mode" <> 'SEA' AND "load_type" IS NULL AND "containers_count" IS NULL)),
  ADD CONSTRAINT "shipments_ports_differ"     CHECK ("loading_port_id" IS NULL OR "loading_port_id" <> "discharge_port_id"),
  ADD CONSTRAINT "shipments_json_arrays"      CHECK (jsonb_typeof("stage_history") = 'array' AND jsonb_typeof("inspections") = 'array');

ALTER TABLE "shipment_containers"
  ADD CONSTRAINT "shipment_containers_seq"    CHECK ("seq" BETWEEN 1 AND 10),
  ADD CONSTRAINT "shipment_containers_weight" CHECK ("weight" >= 0),
  ADD CONSTRAINT "shipment_containers_number" CHECK ("type" = 'LCL' OR "container_no" IS NOT NULL),
  ADD CONSTRAINT "shipment_containers_format" CHECK ("container_no" IS NULL OR "container_no" ~ '^[A-Z]{4}[0-9]{7}$');

ALTER TABLE "shipment_documents"
  ADD CONSTRAINT "shipment_documents_pdf"  CHECK ("mime_type" = 'application/pdf'),
  ADD CONSTRAINT "shipment_documents_size" CHECK ("size" > 0 AND "size" <= 10485760);

-- Audit trail: rows are never edited or removed
CREATE FUNCTION "forbid_audit_change"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "forbid_audit_change"();
