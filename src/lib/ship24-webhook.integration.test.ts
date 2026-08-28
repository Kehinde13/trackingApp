import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CarrierConnectionStatus, ProviderWebhookOutcome, ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { processShip24Webhook } from "@/lib/ship24-webhook";
import { parseShip24Webhook } from "@/lib/ship24-webhook-schema";
import { generatePublicTrackingToken } from "@/lib/tracking-token";
import { webhookPayloadHash } from "@/lib/webhook-security";

describe.runIf(Boolean(process.env.DATABASE_URL))("Ship24 webhook database integration", () => {
  const providerTrackerId = `trk_${randomUUID()}`;
  const trackingNumber = `FAKE${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const hashes: string[] = [];
  const additionalShipmentIds: string[] = [];
  let shipmentId = "";
  const adminAt = new Date(Date.now() - 60_000);

  const payload = (events: object[], trackerId = providerTrackerId, clientTrackerId = `parceltrack:${shipmentId}`, statusMilestone = "in_transit") => JSON.stringify({ trackings: [{ metadata: { generatedAt: new Date().toISOString() }, tracker: { trackerId, trackingNumber, clientTrackerId }, shipment: { statusCode: null, statusMilestone }, events }] });
  async function deliver(raw: string) {
    hashes.push(webhookPayloadHash(raw, "ship24"));
    const parsed = parseShip24Webhook(JSON.parse(raw));
    if (!parsed) throw new Error("invalid fixture");
    return processShip24Webhook(raw, parsed);
  }

  beforeAll(async () => {
    const shipment = await prisma.shipment.create({ data: {
      reference: `PT-S24-${randomUUID()}`, publicToken: generatePublicTrackingToken(), trackingNumber,
      trackingProvider: "ship24", providerTrackerId, carrierConnectionStatus: CarrierConnectionStatus.ACTIVE,
      trackingEvents: { create: { source: TrackingEventSource.ADMIN, status: ShipmentStatus.IN_TRANSIT, description: "Protected administrator update", occurredAt: adminAt } },
    }, select: { id: true } });
    shipmentId = shipment.id;
  });
  afterAll(async () => {
    if (shipmentId) await prisma.shipment.deleteMany({ where: { id: shipmentId } });
    if (additionalShipmentIds.length) await prisma.shipment.deleteMany({ where: { id: { in: additionalShipmentIds } } });
    await prisma.providerWebhookReceipt.deleteMany({ where: { payloadHash: { in: hashes } } });
    await prisma.$disconnect();
  });

  it("deduplicates grouped retries and preserves ambiguous/out-of-order semantics", async () => {
    const raw = payload([
      { eventId: "evt-known", status: "Information received", occurrenceDatetime: new Date(adminAt.getTime() - 60_000).toISOString(), order: 1, statusMilestone: "info_received" },
      { eventId: "evt-local", status: "Carrier-local scan", occurrenceDatetime: "2026-08-25T13:00:00", order: 2, statusMilestone: "delivered" },
      { eventId: "evt-unknown", status: "Useful future category", occurrenceDatetime: new Date(adminAt.getTime() + 30_000).toISOString(), order: 3, statusMilestone: "future_status" },
    ]);
    const results = await Promise.all([deliver(raw), deliver(raw)]);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { trackingEvents: true } });
    expect(shipment.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(shipment.trackingEvents.filter((event) => event.source === TrackingEventSource.CARRIER)).toHaveLength(3);
    expect(shipment.trackingEvents.find((event) => event.providerEventId?.includes("ship24") && event.occurredAt === null)).toMatchObject({ providerOccurredAt: "2026-08-25T13:00:00", statusAffectsShipment: false });
    expect(shipment.trackingEvents.find((event) => event.description === "Useful future category")?.statusAffectsShipment).toBe(false);
  });
  it("uses a fresh explicit milestone for backfilled events and rejects a stale webhook regression", async () => {
    const created = await prisma.shipment.create({ data: {
      reference: `PT-S24-BACKFILL-${randomUUID()}`,
      publicToken: generatePublicTrackingToken(),
      trackingNumber: `FAKE${randomUUID().replaceAll("-", "").slice(0, 18)}`,
      trackingProvider: "ship24",
      providerTrackerId: `trk_${randomUUID()}`,
      carrierConnectionStatus: CarrierConnectionStatus.ACTIVE,
      trackingEvents: { create: { source: TrackingEventSource.SYSTEM, status: ShipmentStatus.PENDING, description: "Shipment created", occurredAt: new Date("2026-08-01T10:00:00Z") } },
    }, select: { id: true, trackingNumber: true, providerTrackerId: true } });
    additionalShipmentIds.push(created.id);
    const currentRaw = JSON.stringify({ trackings: [{
      metadata: { generatedAt: "2026-08-10T12:00:00Z" },
      tracker: { trackerId: created.providerTrackerId, trackingNumber: created.trackingNumber, clientTrackerId: `parceltrack:${created.id}` },
      shipment: { statusCode: null, statusMilestone: "in_transit" },
      events: [
        { eventId: "backfill-info", status: "Information received", occurrenceDatetime: "2026-07-01T10:00:00Z", order: 1, statusMilestone: "info_received" },
        { eventId: "backfill-transit", status: "In transit", occurrenceDatetime: "2026-07-02T10:00:00Z", order: 2, statusMilestone: "in_transit" },
      ],
    }] });
    hashes.push(webhookPayloadHash(currentRaw, "ship24"));
    const currentParsed = parseShip24Webhook(JSON.parse(currentRaw));
    if (!currentParsed) throw new Error("invalid current fixture");
    await processShip24Webhook(currentRaw, currentParsed);
    await processShip24Webhook(currentRaw, currentParsed);

    const staleRaw = JSON.stringify({ trackings: [{
      metadata: { generatedAt: "2026-08-09T12:00:00Z" },
      tracker: { trackerId: created.providerTrackerId, trackingNumber: created.trackingNumber, clientTrackerId: `parceltrack:${created.id}` },
      shipment: { statusCode: null, statusMilestone: "info_received" },
      events: [{ eventId: "older-info", status: "Information received", occurrenceDatetime: "2026-06-30T10:00:00Z", order: 0, statusMilestone: "info_received" }],
    }] });
    hashes.push(webhookPayloadHash(staleRaw, "ship24"));
    const staleParsed = parseShip24Webhook(JSON.parse(staleRaw));
    if (!staleParsed) throw new Error("invalid stale fixture");
    await processShip24Webhook(staleRaw, staleParsed);

    const stored = await prisma.shipment.findUniqueOrThrow({ where: { id: created.id }, include: { trackingEvents: true } });
    expect(stored.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(stored.trackingEvents.filter((event) => event.source === TrackingEventSource.SYSTEM)).toHaveLength(1);
    expect(stored.trackingEvents.filter((event) => event.source === TrackingEventSource.CARRIER)).toHaveLength(3);
  });
  it("acknowledges an unknown tracker without creating a shipment", async () => {
    const before = await prisma.shipment.count();
    expect((await deliver(payload([], "unknown-tracker", "parceltrack:00000000-0000-4000-8000-000000000099"))).outcome).toBe(ProviderWebhookOutcome.UNMATCHED);
    expect(await prisma.shipment.count()).toBe(before);
  });
});
