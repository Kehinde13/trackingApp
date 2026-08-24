import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CarrierConnectionStatus, ProviderWebhookOutcome, ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getPublicShipment } from "@/lib/public-shipments";
import { process17TrackWebhook, cleanupExpiredWebhookReceipts } from "@/lib/seventeen-track-webhook";
import { parse17TrackWebhook } from "@/lib/seventeen-track-webhook-schema";
import { generatePublicTrackingToken } from "@/lib/tracking-token";
import { webhookPayloadHash } from "@/lib/webhook-security";

describe.runIf(Boolean(process.env.DATABASE_URL))("17TRACK webhook database integration", () => {
  const reference = `PT-WEBHOOK-${randomUUID()}`;
  const trackingNumber = `TEST-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const publicToken = generatePublicTrackingToken();
  const carrierCode = 3011;
  const receiptHashes: string[] = [];
  let shipmentId = "";
  const base = Date.now() - 4 * 24 * 60 * 60 * 1000;
  const adminDescription = "Administrator verified package handling";

  function updatedRaw(events: object[]) {
    return JSON.stringify({
      event: "TRACKING_UPDATED",
      data: {
        number: trackingNumber,
        carrier: carrierCode,
        ignored_recipient: "must not persist",
        track_info: { tracking: { providers: [{ events }] } },
      },
    });
  }

  async function deliver(raw: string) {
    receiptHashes.push(webhookPayloadHash(raw));
    const parsed = parse17TrackWebhook(JSON.parse(raw));
    if (!parsed) throw new Error("fixture invalid");
    return process17TrackWebhook(raw, parsed);
  }

  beforeAll(async () => {
    const shipment = await prisma.shipment.create({
      data: {
        reference,
        publicToken,
        trackingNumber,
        trackingProvider: "17track",
        providerCarrierCode: String(carrierCode),
        carrierConnectionStatus: CarrierConnectionStatus.ACTIVE,
        carrierRegisteredAt: new Date(base),
        trackingEvents: { create: { source: TrackingEventSource.ADMIN, status: ShipmentStatus.IN_TRANSIT, description: adminDescription, occurredAt: new Date(base + 2_000) } },
      },
      select: { id: true },
    });
    shipmentId = shipment.id;
  });

  afterAll(async () => {
    if (shipmentId) await prisma.shipment.deleteMany({ where: { id: shipmentId } });
    await prisma.providerWebhookReceipt.deleteMany({ where: { payloadHash: { in: receiptHashes } } });
    await prisma.$disconnect();
  });

  it("processes signed-shape updates idempotently and handles concurrent duplicate delivery", async () => {
    const raw = updatedRaw([
      { time_utc: new Date(base + 1_000).toISOString(), description: "Carrier received information", location: "Hub", stage: "InfoReceived", sub_status: "InfoReceived", address: { country: "NG", city: "Lagos", street: "discard", postal_code: "discard" } },
      { time_utc: new Date(base + 3_000).toISOString(), description: "Delivered safely", location: "Destination", stage: "Delivered", sub_status: "Delivered_Other", address: { country: "NG", city: "Abuja" } },
    ]);
    const results = await Promise.all([deliver(raw), deliver(raw)]);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    expect((await deliver(raw)).duplicate).toBe(true);

    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { trackingEvents: true } });
    expect(shipment.trackingEvents.filter((event) => event.source === TrackingEventSource.CARRIER)).toHaveLength(2);
    expect(shipment.trackingEvents.find((event) => event.source === TrackingEventSource.ADMIN)?.description).toBe(adminDescription);
    expect(shipment.status).toBe(ShipmentStatus.DELIVERED);
    expect(shipment.deliveredAt?.getTime()).toBe(base + 3_000);
  });

  it("preserves newer state, deliveredAt, ADMIN events, and warns on unknown statuses", async () => {
    await deliver(updatedRaw([{ time_utc: new Date(base + 500).toISOString(), description: "Backdated transit", stage: "InTransit", sub_status: "InTransit_Other" }]));
    await deliver(updatedRaw([{ time_utc: new Date(base + 4_000).toISOString(), description: "Returned to sender", stage: "Exception", sub_status: "Exception_Returned" }]));
    await deliver(updatedRaw([{ time_utc: new Date(base + 5_000).toISOString(), description: "Future provider category", stage: "BrandNewStage", sub_status: "BrandNewStage_Other" }]));

    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { trackingEvents: true } });
    expect(shipment.status).toBe(ShipmentStatus.RETURNED);
    expect(shipment.deliveredAt?.getTime()).toBe(base + 3_000);
    expect(shipment.carrierLastErrorCode).toBe("PROVIDER_UNKNOWN_STATUS");
    expect(shipment.trackingEvents.some((event) => event.description === "Future provider category")).toBe(false);
    expect(shipment.trackingEvents.find((event) => event.source === TrackingEventSource.ADMIN)?.description).toBe(adminDescription);
  });

  it("acknowledges unmatched/unsupported payloads and stops only provider tracking", async () => {
    const unmatched = updatedRaw([]).replace(trackingNumber, "TEST-NOT-MATCHED");
    expect((await deliver(unmatched)).outcome).toBe(ProviderWebhookOutcome.UNMATCHED);
    const unsupported = JSON.stringify({ event: "FUTURE_EVENT", data: { number: trackingNumber } });
    expect((await deliver(unsupported)).outcome).toBe(ProviderWebhookOutcome.UNSUPPORTED);
    const stopped = JSON.stringify({ event: "TRACKING_STOPPED", data: { number: trackingNumber, carrier: carrierCode, private: "discard" } });
    expect((await deliver(stopped)).outcome).toBe(ProviderWebhookOutcome.STOPPED);

    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    expect(shipment.carrierConnectionStatus).toBe(CarrierConnectionStatus.STOPPED);
    expect(shipment.status).toBe(ShipmentStatus.RETURNED);
  });

  it("keeps receipts minimal, keeps public DTO private, and cleans receipts older than 30 days", async () => {
    const receipts = await prisma.providerWebhookReceipt.findMany({ where: { payloadHash: { in: receiptHashes } } });
    expect(receipts.length).toBeGreaterThan(0);
    expect(receipts.every((receipt) => /^[a-f0-9]{64}$/.test(receipt.payloadHash))).toBe(true);
    expect(JSON.stringify(receipts)).not.toContain(trackingNumber);
    expect(JSON.stringify(receipts)).not.toContain("Delivered safely");

    const publicDto = await getPublicShipment(publicToken);
    expect(JSON.stringify(publicDto)).not.toMatch(/"(?:payloadHash|signature|providerCarrierCode|createdBy|receipt)"\s*:/i);

    const oldHash = "f".repeat(64);
    receiptHashes.push(oldHash);
    await prisma.providerWebhookReceipt.create({ data: { provider: "17track", payloadHash: oldHash, eventType: "UNSUPPORTED", outcome: ProviderWebhookOutcome.UNSUPPORTED, receivedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), processedAt: new Date() } });
    await cleanupExpiredWebhookReceipts();
    expect(await prisma.providerWebhookReceipt.findUnique({ where: { provider_payloadHash: { provider: "17track", payloadHash: oldHash } } })).toBeNull();
  });
});
