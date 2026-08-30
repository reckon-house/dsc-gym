-- G1/G3: communications groundwork.

ALTER TABLE "Athlete" ADD COLUMN "emailOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Athlete" ADD COLUMN "smsOptIn"    BOOLEAN NOT NULL DEFAULT false;

-- Claimed before every send; the unique dedupeKey is what makes a cron re-run
-- or a double tool-call harmless.
CREATE TABLE "NotificationLog" (
    "id"        TEXT NOT NULL,
    "gymId"     TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "channel"   TEXT NOT NULL,
    "sessionId" TEXT,
    "athleteId" TEXT,
    "trainerId" TEXT,
    "blastId"   TEXT,
    "recipient" TEXT NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'pending',
    "detail"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");
CREATE INDEX "NotificationLog_gymId_type_createdAt_idx" ON "NotificationLog"("gymId", "type", "createdAt");
CREATE INDEX "NotificationLog_sessionId_idx" ON "NotificationLog"("sessionId");

CREATE TABLE "Blast" (
    "id"             TEXT NOT NULL,
    "gymId"          TEXT NOT NULL,
    "createdById"    TEXT,
    "source"         TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'draft',
    "channel"        TEXT NOT NULL DEFAULT 'email',
    "audienceKind"   TEXT NOT NULL,
    "audienceLabel"  TEXT NOT NULL,
    "audienceJson"   TEXT NOT NULL,
    "subject"        TEXT NOT NULL,
    "body"           TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount"      INTEGER NOT NULL DEFAULT 0,
    "failedCount"    INTEGER NOT NULL DEFAULT 0,
    "sentAt"         TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Blast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Blast_gymId_createdAt_idx" ON "Blast"("gymId", "createdAt");
