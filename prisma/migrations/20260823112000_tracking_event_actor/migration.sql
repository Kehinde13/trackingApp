-- AlterTable
ALTER TABLE "TrackingEvent" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "TrackingEvent_createdById_idx" ON "TrackingEvent"("createdById");

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
