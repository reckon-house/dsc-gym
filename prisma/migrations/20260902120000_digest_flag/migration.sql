-- Opt-in morning digest for families. Off by default so nobody starts getting
-- a second message about a session they were already reminded of.
ALTER TABLE "GymConfig" ADD COLUMN "digestToFamilies" BOOLEAN NOT NULL DEFAULT false;
