-- SessionAttendee join table — enables group sessions (one Session, many Athletes).
-- Backfill: every existing Session gets one SessionAttendee row matching its
-- current athleteId, so single-athlete sessions read uniformly.

CREATE TABLE "SessionAttendee" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionAttendee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionAttendee_sessionId_athleteId_key"
  ON "SessionAttendee"("sessionId", "athleteId");
CREATE INDEX "SessionAttendee_athleteId_idx" ON "SessionAttendee"("athleteId");

ALTER TABLE "SessionAttendee" ADD CONSTRAINT "SessionAttendee_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionAttendee" ADD CONSTRAINT "SessionAttendee_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one attendee row per existing session, matching its primary athleteId.
INSERT INTO "SessionAttendee" ("id", "sessionId", "athleteId")
SELECT
  'sa_' || "id" AS "id",
  "id" AS "sessionId",
  "athleteId"
FROM "Session";
