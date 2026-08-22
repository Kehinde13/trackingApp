import "dotenv/config";

import { randomBytes } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  PrismaClient,
  ShipmentStatus,
  TrackingEventSource,
} from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const demoEvents = [
  {
    id: "pt_demo_event_info_received",
    source: TrackingEventSource.CARRIER,
    status: ShipmentStatus.INFO_RECEIVED,
    description: "Shipment information received (fake demo event)",
    location: "Berlin, DE",
    city: "Berlin",
    countryCode: "DE",
    occurredAt: new Date("2026-01-12T08:00:00.000Z"),
    providerEventId: "demo-dhl-info-received",
  },
  {
    id: "pt_demo_event_picked_up",
    source: TrackingEventSource.CARRIER,
    status: ShipmentStatus.PICKED_UP,
    description: "Package picked up (fake demo event)",
    location: "Berlin, DE",
    city: "Berlin",
    countryCode: "DE",
    occurredAt: new Date("2026-01-12T12:30:00.000Z"),
    providerEventId: "demo-dhl-picked-up",
  },
  {
    id: "pt_demo_event_in_transit",
    source: TrackingEventSource.CARRIER,
    status: ShipmentStatus.IN_TRANSIT,
    description: "Package in transit (fake demo event)",
    location: "Leipzig, DE",
    city: "Leipzig",
    countryCode: "DE",
    occurredAt: new Date("2026-01-13T03:15:00.000Z"),
    providerEventId: "demo-dhl-in-transit",
  },
  {
    id: "pt_demo_event_customs_documents",
    source: TrackingEventSource.ADMIN,
    status: ShipmentStatus.CUSTOMS,
    description: "Customs documentation submitted (fake admin demo update)",
    location: "Lagos, NG",
    city: "Lagos",
    countryCode: "NG",
    occurredAt: new Date("2026-01-14T09:45:00.000Z"),
    providerEventId: null,
  },
] as const;

async function main(): Promise<void> {
  const shipment = await prisma.shipment.upsert({
    where: { reference: "PT-DEMO-001" },
    update: {
      recipientName: "Demo Customer",
      carrierCode: "dhl",
      carrierName: "DHL",
      trackingNumber: "DEMO-DHL-0001",
      status: ShipmentStatus.IN_TRANSIT,
      originCity: "Berlin",
      originCountryCode: "DE",
      destinationCity: "Lagos",
      destinationCountryCode: "NG",
    },
    create: {
      publicToken: randomBytes(24).toString("base64url"),
      reference: "PT-DEMO-001",
      recipientName: "Demo Customer",
      carrierCode: "dhl",
      carrierName: "DHL",
      trackingNumber: "DEMO-DHL-0001",
      status: ShipmentStatus.IN_TRANSIT,
      originCity: "Berlin",
      originCountryCode: "DE",
      destinationCity: "Lagos",
      destinationCountryCode: "NG",
    },
  });

  for (const event of demoEvents) {
    await prisma.trackingEvent.upsert({
      where: { id: event.id },
      update: { ...event, shipmentId: shipment.id },
      create: { ...event, shipmentId: shipment.id },
    });
  }

  console.log("Seeded fake demo shipment PT-DEMO-001 with four events.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
