-- Public-facing gym info and trainer bios. Surfaced via MCP (gym_overview,
-- trainer_bio, list_services tools) and athlete dashboard.

ALTER TABLE "Gym"
  ADD COLUMN "tagline"        TEXT,
  ADD COLUMN "mission"        TEXT,
  ADD COLUMN "about"          TEXT,
  ADD COLUMN "hoursJson"      JSONB,
  ADD COLUMN "locationsJson"  JSONB,
  ADD COLUMN "contactJson"    JSONB,
  ADD COLUMN "servicesJson"   JSONB,
  ADD COLUMN "facilitiesText" TEXT;

ALTER TABLE "Trainer"
  ADD COLUMN "title"          TEXT,
  ADD COLUMN "bio"            TEXT,
  ADD COLUMN "specialties"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "education"      TEXT;
