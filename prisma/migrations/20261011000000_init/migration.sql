-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "application_status" AS ENUM ('submitted', 'in_review', 'more_info_needed', 'simulated_check_passed', 'simulated_check_failed', 'closed');

-- CreateEnum
CREATE TYPE "loan_product" AS ENUM ('personal', 'education', 'home');

-- CreateTable
CREATE TABLE "applications" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "applicant_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "loan_product" "loan_product" NOT NULL,
    "requested_amount" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" "application_status" NOT NULL,
    "is_simulated" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "from_status" "application_status",
    "to_status" "application_status" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "applications_reference_key" ON "applications"("reference");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_created_at_idx" ON "applications"("created_at" DESC);

-- CreateIndex
CREATE INDEX "status_history_application_id_id_idx" ON "status_history"("application_id", "id");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written section. Prisma cannot express the following, so keep it.
-- ---------------------------------------------------------------------------

-- Business-rule CHECKs.
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_requested_amount_positive" CHECK ("requested_amount" > 0),
  ADD CONSTRAINT "applications_is_simulated_true" CHECK ("is_simulated" IS TRUE),
  ADD CONSTRAINT "applications_reference_format" CHECK ("reference" ~ '^DEMO-[0-9]{6,}$');

ALTER TABLE "status_history"
  ADD CONSTRAINT "status_history_status_changes" CHECK ("from_status" IS DISTINCT FROM "to_status");

ALTER TABLE "rate_limits"
  ADD CONSTRAINT "rate_limits_count_positive" CHECK ("count" > 0);

-- Application references come from a sequence, so they are unique and never reused.
CREATE SEQUENCE "application_reference_seq" AS bigint START 1;

-- The audit trail is append-only: no UPDATE, DELETE or TRUNCATE.
CREATE FUNCTION "status_history_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'status_history is append-only (% blocked)', TG_OP;
END;
$$;

CREATE TRIGGER "status_history_no_update_delete"
  BEFORE UPDATE OR DELETE ON "status_history"
  FOR EACH ROW EXECUTE FUNCTION "status_history_reject_change"();

CREATE TRIGGER "status_history_no_truncate"
  BEFORE TRUNCATE ON "status_history"
  FOR EACH STATEMENT EXECUTE FUNCTION "status_history_reject_change"();
