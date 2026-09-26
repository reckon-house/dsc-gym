-- Sport(s) and grade on athletes. Additive only.
ALTER TABLE "Athlete" ADD COLUMN "sports" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Athlete" ADD COLUMN "gradYear" INTEGER;
ALTER TABLE "Athlete" ADD COLUMN "schoolLevel" TEXT;
