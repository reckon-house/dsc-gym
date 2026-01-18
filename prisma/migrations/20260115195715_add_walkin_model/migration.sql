-- CreateTable
CREATE TABLE "WalkIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "checkInTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedBy" TEXT,
    "claimedAt" DATETIME,
    "convertedToAthleteId" TEXT
);
