-- Phase 1: scheduling engine foundation.
-- Adds Gym tenant scoping, booking-rule config, trainer availability,
-- athlete standing slots, and the draft-schedule / chat tables.
-- Strategy: create Gym first, seed the DSC row, add gymId as NULLABLE,
-- backfill all existing rows to DSC, then enforce NOT NULL + FKs.

-- 1. Create the Gym table and seed DSC.
CREATE TABLE "Gym" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Gym_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Gym" ("id", "name", "timezone")
VALUES ('dsc_default_gym', 'Dallas Sports Collective', 'America/Chicago');

-- 2. GymConfig with sensible defaults for a personal-training gym.
CREATE TABLE "GymConfig" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "floorCap" INTEGER NOT NULL DEFAULT 2,
    "sessionLengthsJson" TEXT NOT NULL DEFAULT '[30,60]',
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "allowSameTrainerSameDay" BOOLEAN NOT NULL DEFAULT true,
    "cancellationPolicyHours" INTEGER NOT NULL DEFAULT 24,
    "noShowPolicy" TEXT NOT NULL DEFAULT 'flag_only',
    "defaultSessionMinutes" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GymConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "GymConfig" ("id", "gymId", "updatedAt")
VALUES ('dsc_default_config', 'dsc_default_gym', CURRENT_TIMESTAMP);

CREATE UNIQUE INDEX "GymConfig_gymId_key" ON "GymConfig"("gymId");

-- 3. Add gymId columns as NULLABLE, backfill to DSC, then enforce NOT NULL.
ALTER TABLE "Trainer" ADD COLUMN "gymId" TEXT;
UPDATE "Trainer" SET "gymId" = 'dsc_default_gym' WHERE "gymId" IS NULL;
ALTER TABLE "Trainer" ALTER COLUMN "gymId" SET NOT NULL;

ALTER TABLE "Athlete" ADD COLUMN "gymId" TEXT;
UPDATE "Athlete" SET "gymId" = 'dsc_default_gym' WHERE "gymId" IS NULL;
ALTER TABLE "Athlete" ALTER COLUMN "gymId" SET NOT NULL;

ALTER TABLE "Session" ADD COLUMN "gymId" TEXT;
UPDATE "Session" SET "gymId" = 'dsc_default_gym' WHERE "gymId" IS NULL;
ALTER TABLE "Session" ALTER COLUMN "gymId" SET NOT NULL;

ALTER TABLE "CheckIn" ADD COLUMN "gymId" TEXT;
UPDATE "CheckIn" SET "gymId" = 'dsc_default_gym' WHERE "gymId" IS NULL;
ALTER TABLE "CheckIn" ALTER COLUMN "gymId" SET NOT NULL;

ALTER TABLE "WalkIn" ADD COLUMN "gymId" TEXT;
UPDATE "WalkIn" SET "gymId" = 'dsc_default_gym' WHERE "gymId" IS NULL;
ALTER TABLE "WalkIn" ALTER COLUMN "gymId" SET NOT NULL;

ALTER TABLE "WaiverSignature" ADD COLUMN "gymId" TEXT;
UPDATE "WaiverSignature" SET "gymId" = 'dsc_default_gym' WHERE "gymId" IS NULL;
ALTER TABLE "WaiverSignature" ALTER COLUMN "gymId" SET NOT NULL;

-- 4. New scheduling tables.
CREATE TABLE "TrainerAvailability" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    CONSTRAINT "TrainerAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "isAvailable" BOOLEAN NOT NULL,
    "reason" TEXT,
    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AthleteStandingSlot" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "trainerId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "AthleteStandingSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftSchedule" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProposedBooking" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "trainerId" TEXT,
    "athleteId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 60,
    "existingSessionId" TEXT,
    "notes" TEXT,
    "conflictReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposedBooking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- 5. Indexes.
CREATE INDEX "TrainerAvailability_trainerId_dayOfWeek_idx" ON "TrainerAvailability"("trainerId", "dayOfWeek");
CREATE INDEX "AvailabilityException_trainerId_date_idx" ON "AvailabilityException"("trainerId", "date");
CREATE INDEX "AthleteStandingSlot_athleteId_idx" ON "AthleteStandingSlot"("athleteId");
CREATE INDEX "DraftSchedule_gymId_status_idx" ON "DraftSchedule"("gymId", "status");
CREATE INDEX "ProposedBooking_draftId_idx" ON "ProposedBooking"("draftId");
CREATE INDEX "ChatMessage_draftId_createdAt_idx" ON "ChatMessage"("draftId", "createdAt");
CREATE INDEX "Athlete_gymId_idx" ON "Athlete"("gymId");
CREATE INDEX "CheckIn_gymId_idx" ON "CheckIn"("gymId");
CREATE INDEX "Session_gymId_scheduledAt_idx" ON "Session"("gymId", "scheduledAt");
CREATE INDEX "Session_trainerId_scheduledAt_idx" ON "Session"("trainerId", "scheduledAt");
CREATE INDEX "Trainer_gymId_idx" ON "Trainer"("gymId");
CREATE INDEX "WaiverSignature_gymId_idx" ON "WaiverSignature"("gymId");
CREATE INDEX "WalkIn_gymId_idx" ON "WalkIn"("gymId");

-- 6. Foreign keys.
ALTER TABLE "GymConfig" ADD CONSTRAINT "GymConfig_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trainer" ADD CONSTRAINT "Trainer_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerAvailability" ADD CONSTRAINT "TrainerAvailability_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteStandingSlot" ADD CONSTRAINT "AthleteStandingSlot_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkIn" ADD CONSTRAINT "WalkIn_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaiverSignature" ADD CONSTRAINT "WaiverSignature_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftSchedule" ADD CONSTRAINT "DraftSchedule_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProposedBooking" ADD CONSTRAINT "ProposedBooking_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DraftSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "DraftSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
