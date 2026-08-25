-- Store provider tracker identities without coupling the shipment model to Ship24.
ALTER TABLE "Shipment"
ADD COLUMN "providerTrackerId" TEXT;

-- Preserve carrier-local/date-only timestamps without inventing a UTC instant.
ALTER TABLE "TrackingEvent"
ALTER COLUMN "occurredAt" DROP NOT NULL,
ADD COLUMN "providerOccurredAt" TEXT,
ADD COLUMN "providerEventOrder" INTEGER,
ADD COLUMN "statusAffectsShipment" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "Shipment_trackingProvider_providerTrackerId_key"
ON "Shipment"("trackingProvider", "providerTrackerId");

CREATE INDEX "TrackingEvent_shipmentId_providerEventOrder_idx"
ON "TrackingEvent"("shipmentId", "providerEventOrder");
