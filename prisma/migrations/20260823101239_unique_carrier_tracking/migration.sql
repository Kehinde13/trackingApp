-- DropIndex
DROP INDEX "Shipment_carrierCode_trackingNumber_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_carrierCode_trackingNumber_key" ON "Shipment"("carrierCode", "trackingNumber");
