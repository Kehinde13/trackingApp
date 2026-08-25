import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { shipment: { findUnique } } }));

describe("public shipment DTO", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns only approved fields and deterministically selects timeline ordering", async () => {
    findUnique.mockResolvedValue({
      id: "private-id", publicToken: "private-token", recipientName: "Private recipient",
      reference: "PT-TEST", status: ShipmentStatus.IN_TRANSIT, carrierName: "DHL", carrierCode: "dhl", trackingNumber: "1234567890",
      originCity: "Berlin", originCountryCode: "DE", destinationCity: "Lagos", destinationCountryCode: "NG",
      estimatedDeliveryAt: null, deliveredAt: null, updatedAt: new Date("2026-08-23T10:00:00Z"),
      trackingEvents: [{ id: "private-event", status: ShipmentStatus.IN_TRANSIT, description: "Moving", location: null, city: "Lagos", countryCode: "NG", occurredAt: new Date("2026-08-23T09:00:00Z"), createdAt: new Date("2026-08-23T09:01:00Z"), source: TrackingEventSource.ADMIN, rawPayload: { private: true }, providerEventId: "private", createdBy: { name: "Private admin" } }],
    });
    const { getPublicShipment } = await import("./public-shipments");
    const dto = await getPublicShipment("AbCdEf0123456789_-AbCdEf01234567");
    expect(Object.keys(dto ?? {}).sort()).toEqual(["carrierName", "deliveredAt", "destinationCity", "destinationCountryCode", "estimatedDeliveryAt", "events", "lastUpdateAt", "maskedTrackingNumber", "originCity", "originCountryCode", "reference", "status"].sort());
    expect(JSON.stringify(dto)).not.toMatch(/recipient|createdBy|rawPayload|providerEventId|private-id|private-token|Private admin/);
    expect(dto?.events[0]).toEqual({ status: ShipmentStatus.IN_TRANSIT, description: "Moving", location: null, city: "Lagos", countryCode: "NG", occurredAt: "2026-08-23T09:00:00.000Z", providerOccurredAt: undefined, sourceLabel: "Shipping team update" });
    expect(findUnique.mock.calls[0][0].select.trackingEvents.orderBy).toEqual([{ occurredAt: { sort: "asc", nulls: "last" } }, { providerEventOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }]);
    expect(findUnique.mock.calls[0][0].select).not.toHaveProperty("recipientName");
  });
});
