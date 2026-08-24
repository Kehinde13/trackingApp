-- CreateEnum
CREATE TYPE "CarrierConnectionStatus" AS ENUM ('UNLINKED', 'REGISTERING', 'ACTIVE', 'ERROR', 'STOPPED');

-- AlterTable
ALTER TABLE "Shipment"
ADD COLUMN "trackingProvider" TEXT,
ADD COLUMN "providerCarrierCode" TEXT,
ADD COLUMN "carrierConnectionStatus" "CarrierConnectionStatus" NOT NULL DEFAULT 'UNLINKED',
ADD COLUMN "carrierRegisteredAt" TIMESTAMP(3),
ADD COLUMN "carrierLastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN "carrierLastErrorCode" TEXT,
ADD COLUMN "carrierLastErrorAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Shipment_trackingProvider_carrierConnectionStatus_idx" ON "Shipment"("trackingProvider", "carrierConnectionStatus");
