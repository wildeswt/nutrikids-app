-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "Indicator" AS ENUM ('WEIGHT_FOR_AGE', 'LENGTH_HEIGHT_FOR_AGE', 'WEIGHT_FOR_LENGTH_HEIGHT', 'BMI_FOR_AGE');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('RECUMBENT', 'STANDING');

-- CreateEnum
CREATE TYPE "Origin" AS ENUM ('CAREGIVER', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "Risk" AS ENUM ('UNDERWEIGHT', 'STUNTING', 'WASTING', 'OVERWEIGHT', 'OBESITY');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('GENERATED', 'PENDING_REVIEW', 'REVIEWED', 'FOLLOW_UP_ESTABLISHED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregivers" (
    "user_id" UUID NOT NULL,
    "phone" TEXT,

    CONSTRAINT "caregivers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "user_id" UUID NOT NULL,
    "specialty" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "totp_secret_enc" TEXT,
    "totp_enabled_at" TIMESTAMPTZ(3),
    "recovery_code_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "sex" "Sex" NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_children" (
    "caregiver_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "is_legal_representative" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "caregiver_children_pkey" PRIMARY KEY ("caregiver_id","child_id")
);

-- CreateTable
CREATE TABLE "professional_children" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "start_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" DATE,

    CONSTRAINT "professional_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "caregiver_id" UUID NOT NULL,
    "text_version" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkups" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "measured_at" TIMESTAMPTZ(3) NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "length_height_cm" DECIMAL(4,1) NOT NULL,
    "position" "Position" NOT NULL,
    "origin" "Origin" NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "corrected_checkup_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lms_references" (
    "indicator" "Indicator" NOT NULL,
    "sex" "Sex" NOT NULL,
    "x" DECIMAL(6,2) NOT NULL,
    "l" DECIMAL(8,4) NOT NULL,
    "m" DECIMAL(8,4) NOT NULL,
    "s" DECIMAL(8,5) NOT NULL,

    CONSTRAINT "lms_references_pkey" PRIMARY KEY ("indicator","sex","x")
);

-- CreateTable
CREATE TABLE "indicator_results" (
    "id" UUID NOT NULL,
    "checkup_id" UUID NOT NULL,
    "indicator" "Indicator" NOT NULL,
    "z_score" DECIMAL(5,2) NOT NULL,
    "percentile" DECIMAL(5,2) NOT NULL,
    "classification" TEXT NOT NULL,
    "reference_version" TEXT NOT NULL,

    CONSTRAINT "indicator_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feeding_logs" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "log_date" DATE NOT NULL,
    "meals_per_day" SMALLINT,
    "details" TEXT,

    CONSTRAINT "feeding_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "indicator_result_id" UUID NOT NULL,
    "risk_type" "Risk" NOT NULL,
    "is_severe" BOOLEAN NOT NULL DEFAULT false,
    "status" "AlertStatus" NOT NULL DEFAULT 'GENERATED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "status" "AlertStatus" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "alert_id" UUID,
    "professional_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "next_checkup_date" DATE,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educational_contents" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "min_age_months" SMALLINT NOT NULL,
    "max_age_months" SMALLINT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',

    CONSTRAINT "educational_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_license_number_key" ON "professionals"("license_number");

-- CreateIndex
CREATE INDEX "caregiver_children_child_id_idx" ON "caregiver_children"("child_id");

-- CreateIndex
CREATE INDEX "professional_children_child_id_idx" ON "professional_children"("child_id");

-- CreateIndex
CREATE INDEX "professional_children_professional_id_idx" ON "professional_children"("professional_id");

-- CreateIndex
CREATE INDEX "consents_child_id_idx" ON "consents"("child_id");

-- CreateIndex
CREATE INDEX "consents_caregiver_id_idx" ON "consents"("caregiver_id");

-- CreateIndex
CREATE INDEX "checkups_child_id_measured_at_idx" ON "checkups"("child_id", "measured_at");

-- CreateIndex
CREATE INDEX "checkups_recorded_by_id_idx" ON "checkups"("recorded_by_id");

-- CreateIndex
CREATE INDEX "checkups_corrected_checkup_id_idx" ON "checkups"("corrected_checkup_id");

-- CreateIndex
CREATE UNIQUE INDEX "indicator_results_checkup_id_indicator_key" ON "indicator_results"("checkup_id", "indicator");

-- CreateIndex
CREATE INDEX "feeding_logs_child_id_idx" ON "feeding_logs"("child_id");

-- CreateIndex
CREATE INDEX "alerts_indicator_result_id_idx" ON "alerts"("indicator_result_id");

-- CreateIndex
CREATE INDEX "alerts_created_at_idx" ON "alerts"("created_at");

-- CreateIndex
CREATE INDEX "alert_history_alert_id_idx" ON "alert_history"("alert_id");

-- CreateIndex
CREATE INDEX "alert_history_changed_by_id_idx" ON "alert_history"("changed_by_id");

-- CreateIndex
CREATE INDEX "follow_ups_child_id_idx" ON "follow_ups"("child_id");

-- CreateIndex
CREATE INDEX "follow_ups_alert_id_idx" ON "follow_ups"("alert_id");

-- CreateIndex
CREATE INDEX "follow_ups_professional_id_idx" ON "follow_ups"("professional_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_recipient_id_idx" ON "messages"("recipient_id");

-- CreateIndex
CREATE INDEX "reminders_child_id_idx" ON "reminders"("child_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_user_id_idx" ON "push_devices"("user_id");

-- AddForeignKey
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_children" ADD CONSTRAINT "caregiver_children_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "caregivers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_children" ADD CONSTRAINT "caregiver_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_children" ADD CONSTRAINT "professional_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_children" ADD CONSTRAINT "professional_children_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_caregiver_id_fkey" FOREIGN KEY ("caregiver_id") REFERENCES "caregivers"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkups" ADD CONSTRAINT "checkups_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkups" ADD CONSTRAINT "checkups_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkups" ADD CONSTRAINT "checkups_corrected_checkup_id_fkey" FOREIGN KEY ("corrected_checkup_id") REFERENCES "checkups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_results" ADD CONSTRAINT "indicator_results_checkup_id_fkey" FOREIGN KEY ("checkup_id") REFERENCES "checkups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeding_logs" ADD CONSTRAINT "feeding_logs_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_indicator_result_id_fkey" FOREIGN KEY ("indicator_result_id") REFERENCES "indicator_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom Check Constraints (defined in design specification)

-- Checkups: physical plausibility ranges for infant and early childhood anthropometry
ALTER TABLE "checkups" ADD CONSTRAINT "checkups_weight_kg_range"
  CHECK ("weight_kg" BETWEEN 2 AND 40);

ALTER TABLE "checkups" ADD CONSTRAINT "checkups_length_height_cm_range"
  CHECK ("length_height_cm" BETWEEN 40 AND 140);

-- Indicator Results: percentile valid range [0, 100]
ALTER TABLE "indicator_results" ADD CONSTRAINT "indicator_results_percentile_range"
  CHECK ("percentile" BETWEEN 0 AND 100);

-- Feeding Logs: reasonable daily meal frequency range [0, 12]
ALTER TABLE "feeding_logs" ADD CONSTRAINT "feeding_logs_meals_per_day_range"
  CHECK ("meals_per_day" IS NULL OR "meals_per_day" BETWEEN 0 AND 12);

-- Educational Contents: maximum target age must be greater than or equal to minimum target age
ALTER TABLE "educational_contents" ADD CONSTRAINT "educational_contents_age_range_check"
  CHECK ("max_age_months" >= "min_age_months");

-- Professional Children: end date must be on or after start date
ALTER TABLE "professional_children" ADD CONSTRAINT "professional_children_dates_check"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- Users: valid status values
ALTER TABLE "users" ADD CONSTRAINT "users_status_check"
  CHECK ("status" IN ('active', 'suspended'));

-- Professionals: recognized medical specialty areas
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_specialty_check"
  CHECK ("specialty" IN ('nursing', 'nutrition', 'pediatrics', 'enfermeria', 'nutricion', 'pediatria'));

-- Follow Ups: valid clinical follow-up types
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_type_check"
  CHECK ("type" IN ('observation', 'recommendation', 'intervention', 'referral'));

-- Reminders: valid reminder statuses
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_status_check"
  CHECK ("status" IN ('pending', 'sent', 'completed'));

