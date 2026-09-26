-- Athlete health notes (injuries, PT, conditions). Additive only.
CREATE TABLE "HealthNote" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "since" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByRole" TEXT NOT NULL,
    "createdByName" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HealthNote_athleteId_active_idx" ON "HealthNote"("athleteId", "active");
ALTER TABLE "HealthNote" ADD CONSTRAINT "HealthNote_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
