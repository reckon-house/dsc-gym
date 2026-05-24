-- Soft-archive flags for departures. Existing rows default to active.

ALTER TABLE "Trainer" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Athlete" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Trainer_archived_idx" ON "Trainer"("archived");
CREATE INDEX "Athlete_archived_idx" ON "Athlete"("archived");
