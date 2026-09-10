-- Parent/guardian and emergency contact, captured at signup for under-18s.
-- All nullable: existing athletes have none and are not being backfilled.
ALTER TABLE "Athlete" ADD COLUMN "parentName" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "parentPhone" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "parentRelationship" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "emergencyName" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "emergencyPhone" TEXT;
ALTER TABLE "Athlete" ADD COLUMN "emergencyRelationship" TEXT;
