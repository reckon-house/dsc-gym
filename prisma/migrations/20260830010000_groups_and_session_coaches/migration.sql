-- Phase C: named groups, multi-coach sessions, and retiring the roster-in-notes hack.

ALTER TABLE "Session" ADD COLUMN "groupId" TEXT;
ALTER TABLE "ProposedBooking" ADD COLUMN "attendeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProposedBooking" ADD COLUMN "coachIds"    TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProposedBooking" ADD COLUMN "groupId"     TEXT;

CREATE TABLE "Group" (
    "id"          TEXT NOT NULL,
    "gymId"       TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "dayOfWeek"   INTEGER,
    "startMinute" INTEGER,
    "duration"    INTEGER NOT NULL DEFAULT 60,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Group_gymId_name_key" ON "Group"("gymId", "name");
CREATE INDEX "Group_gymId_active_idx" ON "Group"("gymId", "active");

CREATE TABLE "GroupMember" (
    "id"        TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupMember_groupId_athleteId_key" ON "GroupMember"("groupId", "athleteId");
CREATE INDEX "GroupMember_athleteId_idx" ON "GroupMember"("athleteId");

CREATE TABLE "GroupCoach" (
    "id"        TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "isLead"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupCoach_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupCoach_groupId_trainerId_key" ON "GroupCoach"("groupId", "trainerId");
CREATE INDEX "GroupCoach_trainerId_idx" ON "GroupCoach"("trainerId");

CREATE TABLE "SessionCoach" (
    "id"        TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionCoach_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionCoach_sessionId_trainerId_key" ON "SessionCoach"("sessionId", "trainerId");
CREATE INDEX "SessionCoach_trainerId_idx" ON "SessionCoach"("trainerId");

CREATE INDEX "Session_groupId_idx" ON "Session"("groupId");

ALTER TABLE "Group" ADD CONSTRAINT "Group_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupCoach" ADD CONSTRAINT "GroupCoach_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupCoach" ADD CONSTRAINT "GroupCoach_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionCoach" ADD CONSTRAINT "SessionCoach_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionCoach" ADD CONSTRAINT "SessionCoach_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill 1: every existing session's trainer becomes its lead SessionCoach,
-- so coach-aware queries see a complete picture from day one.
INSERT INTO "SessionCoach" ("id", "sessionId", "trainerId")
SELECT gen_random_uuid()::text, s."id", s."trainerId" FROM "Session" s
ON CONFLICT DO NOTHING;

-- Backfill 2: admin-created sessions never got a SessionAttendee row (that
-- route only started writing one in this release). After this, attendees are
-- authoritative for EVERY session and callers can stop falling back to
-- Session.athleteId.
INSERT INTO "SessionAttendee" ("id", "sessionId", "athleteId")
SELECT gen_random_uuid()::text, s."id", s."athleteId" FROM "Session" s
WHERE NOT EXISTS (SELECT 1 FROM "SessionAttendee" a WHERE a."sessionId" = s."id")
ON CONFLICT DO NOTHING;
