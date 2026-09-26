-- Coach ↔ PT injury follow-ups. Additive, plus flagging Justin as the PT.
ALTER TABLE "User" ADD COLUMN "isPT" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HealthNote" ADD COLUMN "ptStatus" TEXT;
ALTER TABLE "HealthNote" ADD COLUMN "flaggedAt" TIMESTAMP(3);
ALTER TABLE "HealthNote" ADD COLUMN "flaggedByName" TEXT;
ALTER TABLE "HealthNote" ADD COLUMN "flaggedById" TEXT;
ALTER TABLE "HealthNote" ADD COLUMN "clearedAt" TIMESTAMP(3);
ALTER TABLE "HealthNote" ADD COLUMN "clearedByName" TEXT;
CREATE INDEX "HealthNote_gymId_ptStatus_idx" ON "HealthNote"("gymId", "ptStatus");

CREATE TABLE "HealthNoteComment" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "byUserId" TEXT,
    "byName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthNoteComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HealthNoteComment_noteId_createdAt_idx" ON "HealthNoteComment"("noteId", "createdAt");
ALTER TABLE "HealthNoteComment" ADD CONSTRAINT "HealthNoteComment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "HealthNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Justin is the gym's PT. Only applies when exactly one active staff login is
-- named Justin, so it can never guess between two people.
UPDATE "User" SET "isPT" = true
WHERE "name" = 'Justin' AND "active" = true
  AND (SELECT count(*) FROM "User" WHERE "name" = 'Justin' AND "active" = true) = 1;
