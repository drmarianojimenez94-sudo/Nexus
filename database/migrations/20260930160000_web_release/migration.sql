-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "clinical_patients" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "clinical_followups" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "clinical_templates" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "builtinId" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "favorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lineageId" TEXT,
ADD COLUMN     "previousVersionId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "projects_userId_clientId_key" ON "projects"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_patients_userId_clientId_key" ON "clinical_patients"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_followups_userId_clientId_key" ON "clinical_followups"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_templates_userId_builtinId_key" ON "clinical_templates"("userId", "builtinId");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_templates_userId_clientId_key" ON "clinical_templates"("userId", "clientId");

