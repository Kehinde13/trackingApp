-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'INFO_RECEIVED', 'PICKED_UP', 'IN_TRANSIT', 'CUSTOMS', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'EXCEPTION', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrackingEventSource" AS ENUM ('CARRIER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "recipientName" TEXT,
    "carrierCode" TEXT,
    "carrierName" TEXT,
    "trackingNumber" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "originCity" TEXT,
    "originCountryCode" TEXT,
    "destinationCity" TEXT,
    "destinationCountryCode" TEXT,
    "estimatedDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "source" "TrackingEventSource" NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "city" TEXT,
    "countryCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "providerEventId" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_publicToken_key" ON "Shipment"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_reference_key" ON "Shipment"("reference");

-- CreateIndex
CREATE INDEX "Shipment_publicToken_idx" ON "Shipment"("publicToken");

-- CreateIndex
CREATE INDEX "Shipment_reference_idx" ON "Shipment"("reference");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_carrierCode_trackingNumber_idx" ON "Shipment"("carrierCode", "trackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_createdAt_idx" ON "Shipment"("createdAt");

-- CreateIndex
CREATE INDEX "TrackingEvent_shipmentId_occurredAt_idx" ON "TrackingEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "TrackingEvent_source_idx" ON "TrackingEvent"("source");

-- CreateIndex
CREATE INDEX "TrackingEvent_status_idx" ON "TrackingEvent"("status");

-- CreateIndex
CREATE INDEX "TrackingEvent_providerEventId_idx" ON "TrackingEvent"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingEvent_shipmentId_providerEventId_key" ON "TrackingEvent"("shipmentId", "providerEventId");

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
