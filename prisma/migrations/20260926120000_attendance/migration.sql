-- Attendance: who actually came, as opposed to who was booked.
ALTER TABLE "SessionAttendee" ADD COLUMN "status" TEXT;
ALTER TABLE "SessionAttendee" ADD COLUMN "dropIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SessionAttendee" ADD COLUMN "markedAt" TIMESTAMP(3);
ALTER TABLE "SessionAttendee" ADD COLUMN "markedById" TEXT;
ALTER TABLE "Session" ADD COLUMN "attendanceTakenAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "attendanceTakenById" TEXT;
CREATE INDEX "SessionAttendee_athleteId_status_idx" ON "SessionAttendee"("athleteId", "status");
