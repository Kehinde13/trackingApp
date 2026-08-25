import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { syncShipmentTracking, registerShipmentTracking } from "@/lib/carrier-tracking";
import { FakeTrackingProvider } from "@/lib/fake-tracking-provider";
import { prisma } from "@/lib/prisma";
import { getPublicShipment } from "@/lib/public-shipments";
import { generatePublicTrackingToken } from "@/lib/tracking-token";

describe.runIf(Boolean(process.env.DATABASE_URL))("carrier tracking database integration", () => {
  const reference = `PT-CARRIER-${randomUUID()}`;
  const publicToken = generatePublicTrackingToken();
  let shipmentId = "";
  const adminDescription = "Administrator confirmed parcel handoff";
  const providerTrackerId = `test-tracker-${randomUUID()}`;
  const provider = new FakeTrackingProvider({ carrierCode: "3011", events: [] }, providerTrackerId);

  beforeAll(async () => {
    const shipment = await prisma.shipment.create({
      data: {
        reference, publicToken, trackingNumber: "TEST-987654321", carrierName: "Invented Carrier",
        trackingEvents: { create: { source: TrackingEventSource.ADMIN, status: ShipmentStatus.IN_TRANSIT, description: adminDescription, occurredAt: new Date("2026-08-20T12:00:00Z") } },
      }, select: { id: true },
    });
    shipmentId = shipment.id;
  });

  afterAll(async () => {
    if (shipmentId) await prisma.shipment.delete({ where: { id: shipmentId } });
    await prisma.$disconnect();
  });

  it("registers, synchronizes concurrently, deduplicates, and preserves chronology/privacy", async () => {
    await registerShipmentTracking(shipmentId, undefined, provider);
    await registerShipmentTracking(shipmentId, undefined, provider);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } })).providerTrackerId).toBe(providerTrackerId);
    expect(provider.registrations).toHaveLength(1);
    provider.setEvents([
      { occurredAt: new Date("2026-08-19T10:00:00Z"), providerStatus: "InfoReceived", description: "Carrier received information" },
      { occurredAt: new Date("2026-08-21T10:00:00Z"), providerStatus: "Delivered", description: "Delivered to recipient" },
    ]);
    await Promise.all([syncShipmentTracking(shipmentId, provider), syncShipmentTracking(shipmentId, provider)]);
    await syncShipmentTracking(shipmentId, provider);

    let shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { trackingEvents: true } });
    expect(shipment.trackingEvents.filter((event) => event.source === TrackingEventSource.CARRIER)).toHaveLength(2);
    expect(shipment.trackingEvents.find((event) => event.source === TrackingEventSource.ADMIN)?.description).toBe(adminDescription);
    expect(shipment.status).toBe(ShipmentStatus.DELIVERED);
    expect(shipment.deliveredAt?.toISOString()).toBe("2026-08-21T10:00:00.000Z");

    provider.setEvents([{ occurredAt: new Date("2026-08-18T10:00:00Z"), providerStatus: "InTransit", description: "Backdated transit scan" }]);
    await syncShipmentTracking(shipmentId, provider);
    provider.setEvents([{ occurredAt: new Date("2026-08-22T10:00:00Z"), providerStatus: "Exception", providerSubStatus: "Exception_Returned", description: "Returned to sender" }]);
    await syncShipmentTracking(shipmentId, provider);

    shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { trackingEvents: true } });
    expect(shipment.status).toBe(ShipmentStatus.RETURNED);
    expect(shipment.deliveredAt?.toISOString()).toBe("2026-08-21T10:00:00.000Z");
    const publicDto = await getPublicShipment(publicToken);
    expect(publicDto?.events.some((event) => event.sourceLabel === "Carrier update")).toBe(true);
    expect(JSON.stringify(publicDto)).not.toMatch(/providerCarrierCode|carrierLastError|createdBy|trackingProvider|3011/);
  });
});
