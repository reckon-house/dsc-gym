-- Open groups: a group can now sit on the schedule advertising itself before
-- anyone has joined, and families can ask for a spot.

ALTER TABLE "Group" ADD COLUMN "openForSignup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "Group" ADD COLUMN "description" TEXT;

CREATE TABLE "GroupJoinRequest" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "declineReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupJoinRequest_gymId_status_idx" ON "GroupJoinRequest"("gymId", "status");
CREATE INDEX "GroupJoinRequest_groupId_status_idx" ON "GroupJoinRequest"("groupId", "status");
CREATE INDEX "GroupJoinRequest_athleteId_idx" ON "GroupJoinRequest"("athleteId");

-- One live request per athlete per group. Partial, so a declined request does
-- not block asking again later — only an unresolved one does. Prisma cannot
-- express a partial unique index in the schema, hence the raw statement.
CREATE UNIQUE INDEX "GroupJoinRequest_one_pending_per_athlete"
    ON "GroupJoinRequest"("groupId", "athleteId")
    WHERE "status" = 'pending';

ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
