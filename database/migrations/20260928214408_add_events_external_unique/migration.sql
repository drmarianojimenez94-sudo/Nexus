-- CreateIndex
CREATE UNIQUE INDEX "events_userId_externalSource_externalId_key" ON "events"("userId", "externalSource", "externalId");
