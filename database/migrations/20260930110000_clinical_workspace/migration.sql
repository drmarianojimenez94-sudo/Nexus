-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "claimedUntil" TIMESTAMP(3),
ADD COLUMN     "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inbox_items" ADD COLUMN     "captureId" TEXT;

-- CreateTable
CREATE TABLE "clinical_patients" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordEncrypted" TEXT NOT NULL,
    "searchTokens" TEXT[],
    "documentHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_encounters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "recordEncrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_followups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordEncrypted" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinical_patients_userId_archived_updatedAt_idx" ON "clinical_patients"("userId", "archived", "updatedAt");

-- CreateIndex
CREATE INDEX "clinical_patients_searchTokens_idx" ON "clinical_patients" USING GIN ("searchTokens");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_patients_userId_documentHash_key" ON "clinical_patients"("userId", "documentHash");

-- CreateIndex
CREATE INDEX "clinical_encounters_userId_patientId_occurredAt_idx" ON "clinical_encounters"("userId", "patientId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_encounters_userId_clientId_key" ON "clinical_encounters"("userId", "clientId");

-- CreateIndex
CREATE INDEX "clinical_followups_userId_status_dueAt_idx" ON "clinical_followups"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "clinical_templates_userId_idx" ON "clinical_templates"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_items_userId_captureId_key" ON "inbox_items"("userId", "captureId");

-- AddForeignKey
ALTER TABLE "clinical_patients" ADD CONSTRAINT "clinical_patients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "clinical_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_followups" ADD CONSTRAINT "clinical_followups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_followups" ADD CONSTRAINT "clinical_followups_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "clinical_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_templates" ADD CONSTRAINT "clinical_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

