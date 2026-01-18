-- CreateTable
CREATE TABLE "WaiverSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "athleteId" TEXT
);

-- CreateIndex
CREATE INDEX "WaiverSignature_email_idx" ON "WaiverSignature"("email");
