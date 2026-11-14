-- CreateEnum
CREATE TYPE "DayStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "journal_days" (
    "date" DATE NOT NULL,
    "status" "DayStatus" NOT NULL DEFAULT 'CLOSED',
    "closed_at" TIMESTAMP(3),
    "reopened_until" DATE,
    "reopened_by" INTEGER,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "journal_days_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "journal_day_accounts" (
    "date" DATE NOT NULL,
    "account_id" INTEGER NOT NULL,
    "opening" DECIMAL(14,2) NOT NULL,
    "in" DECIMAL(14,2) NOT NULL,
    "out" DECIMAL(14,2) NOT NULL,
    "closing" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "journal_day_accounts_pkey" PRIMARY KEY ("date","account_id")
);

-- AddForeignKey
ALTER TABLE "journal_days" ADD CONSTRAINT "journal_days_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_day_accounts" ADD CONSTRAINT "journal_day_accounts_date_fkey" FOREIGN KEY ("date") REFERENCES "journal_days"("date") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_day_accounts" ADD CONSTRAINT "journal_day_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- an open past day is a reopened one, with the day it closes again
ALTER TABLE "journal_days"
  ADD CONSTRAINT "journal_days_open_until" CHECK ("status" = 'CLOSED' OR "reopened_until" IS NOT NULL);
