-- Phase A: admin profile editing groundwork.
--
-- 1) birthdate: stored as DATE (no time). Nullable — every existing athlete
--    predates the field, and age-banded email segments must treat NULL as
--    "unknown" rather than guessing.
ALTER TABLE "Athlete" ADD COLUMN "birthdate" DATE;

-- 2) Athlete.trainerId FK: ON DELETE CASCADE -> SET NULL.
--    Under CASCADE, deleting a Trainer row silently deletes every athlete
--    assigned to that trainer. Nothing calls trainer.delete today (archive
--    nulls trainerId first), but Phase A introduces hard deletes to the
--    codebase and this footgun should not be one bad query away.
ALTER TABLE "Athlete" DROP CONSTRAINT "Athlete_trainerId_fkey";
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_trainerId_fkey"
  FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
