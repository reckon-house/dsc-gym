-- A group session gets one check-in per athlete. The unique index on
-- sessionId allowed only one, so the second kid checking into a class failed.
-- Loosening a constraint: no rows change.
DROP INDEX IF EXISTS "CheckIn_sessionId_key";
CREATE INDEX "CheckIn_sessionId_idx" ON "CheckIn"("sessionId");
ALTER TABLE "CheckIn" ADD COLUMN "checkedInById" TEXT;
