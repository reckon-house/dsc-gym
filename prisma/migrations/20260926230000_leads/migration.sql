-- Lead / waitlist tracker. Additive only.
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "parentName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "birthdate" DATE,
    "interest" TEXT,
    "source" TEXT NOT NULL DEFAULT 'other',
    "sourceDetail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "location" TEXT,
    "groupId" TEXT,
    "followUpOn" DATE,
    "lastContactedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "convertedAthleteId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Lead_gymId_status_idx" ON "Lead"("gymId", "status");
CREATE INDEX "Lead_gymId_followUpOn_idx" ON "Lead"("gymId", "followUpOn");

CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "byName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LeadNote_leadId_createdAt_idx" ON "LeadNote"("leadId", "createdAt");
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
