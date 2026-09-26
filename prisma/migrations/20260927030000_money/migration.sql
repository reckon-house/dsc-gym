-- Phase 4: owners, price sheet, billing plans, payments. Additive only,
-- plus flagging the two owners by email.
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GymConfig" ADD COLUMN "billingStartDate" DATE;
ALTER TABLE "GymConfig" ADD COLUMN "pricingNote" TEXT;
ALTER TABLE "Group" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "Athlete" ADD COLUMN "billingPlan" TEXT NOT NULL DEFAULT 'per_session';
ALTER TABLE "Athlete" ADD COLUMN "paidThrough" DATE;
ALTER TABLE "Athlete" ADD COLUMN "billingNote" TEXT;

CREATE TABLE "PriceItem" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classType" TEXT,
    "durationMinutes" INTEGER,
    "priceCents" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'session',
    "sessionsIncluded" INTEGER,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceItem_gymId_active_idx" ON "PriceItem"("gymId", "active");

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "athleteId" TEXT,
    "athleteName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "coversThrough" DATE,
    "recordedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payment_gymId_paidOn_idx" ON "Payment"("gymId", "paidOn");
CREATE INDEX "Payment_athleteId_idx" ON "Payment"("athleteId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Jordan and Scott own the gym. Matches nothing on a database without them.
UPDATE "User" SET "isOwner" = true
WHERE lower("email") IN ('jordan@dsportcollective.com', 'smullenix12@gmail.com') AND "role" = 'ADMIN';
