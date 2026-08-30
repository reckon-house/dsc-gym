-- Phases D, E, F.

ALTER TABLE "GymConfig" ADD COLUMN "recoveryPriceCents" INTEGER NOT NULL DEFAULT 2500;

CREATE TABLE "CalendarEvent" (
    "id"          TEXT NOT NULL,
    "gymId"       TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "startsAt"    TIMESTAMP(3) NOT NULL,
    "duration"    INTEGER NOT NULL DEFAULT 60,
    "kind"        TEXT NOT NULL DEFAULT 'meeting',
    "trainerIds"  TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy"   TEXT,
    "cancelled"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarEvent_gymId_startsAt_idx" ON "CalendarEvent"("gymId", "startsAt");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_gymId_fkey"
  FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RecoveryVisit" (
    "id"         TEXT NOT NULL,
    "gymId"      TEXT NOT NULL,
    "athleteId"  TEXT NOT NULL,
    "at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceCents" INTEGER NOT NULL,
    "note"       TEXT,
    "createdBy"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryVisit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecoveryVisit_gymId_at_idx" ON "RecoveryVisit"("gymId", "at");
CREATE INDEX "RecoveryVisit_athleteId_at_idx" ON "RecoveryVisit"("athleteId", "at");
ALTER TABLE "RecoveryVisit" ADD CONSTRAINT "RecoveryVisit_gymId_fkey"
  FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryVisit" ADD CONSTRAINT "RecoveryVisit_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attendance-vs-schedule scans by athlete over a window. The extra-visit
-- signal (matched=false) was already being written; it just had no index.
CREATE INDEX "CheckIn_athleteId_checkInTime_idx" ON "CheckIn"("athleteId", "checkInTime");
CREATE INDEX "CheckIn_gymId_matched_checkInTime_idx" ON "CheckIn"("gymId", "matched", "checkInTime");
