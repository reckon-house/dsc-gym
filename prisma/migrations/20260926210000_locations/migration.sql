-- Celina / McKinney tagging. Additive only; everything starts untagged.
ALTER TABLE "Group" ADD COLUMN "location" TEXT;
ALTER TABLE "Session" ADD COLUMN "location" TEXT;
