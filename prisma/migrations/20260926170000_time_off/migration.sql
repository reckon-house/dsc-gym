-- Coach time-off requests. Additive only.
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "exceptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TimeOffRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TimeOffRequest_gymId_status_idx" ON "TimeOffRequest"("gymId", "status");
CREATE INDEX "TimeOffRequest_trainerId_startDate_idx" ON "TimeOffRequest"("trainerId", "startDate");
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
