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
  let shipmentId = "";
  const adminAt = new Date(Date.now() - 60_000);

  const payload = (events: object[], trackerId = providerTrackerId, clientTrackerId = `parceltrack:${shipmentId}`) => JSON.stringify({ trackings: [{ tracker: { trackerId, trackingNumber, clientTrackerId }, events }] });
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
  it("acknowledges an unknown tracker without creating a shipment", async () => {
    const before = await prisma.shipment.count();
    expect((await deliver(payload([], "unknown-tracker", "parceltrack:00000000-0000-4000-8000-000000000099"))).outcome).toBe(ProviderWebhookOutcome.UNMATCHED);
    expect(await prisma.shipment.count()).toBe(before);
  });
});
