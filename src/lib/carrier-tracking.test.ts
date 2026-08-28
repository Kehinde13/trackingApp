import { beforeEach, describe, expect, it, vi } from "vitest";

import { CarrierConnectionStatus, ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { TRACKING_ERROR_CODES, TrackingProviderError, type TrackingInfo, type TrackingProvider } from "@/lib/tracking-provider";

const findUnique = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shipment: { findUnique, update },
  },
}));

const julyInfo: TrackingInfo = {
  currentStatus: {
    providerStatus: "in_transit",
    observedAt: new Date("2026-08-10T12:00:00Z"),
  },
  events: [
    { stableId: "info", occurredAt: new Date("2026-07-01T10:00:00Z"), providerStatus: "info_received", description: "Information received" },
    { stableId: "transit", occurredAt: new Date("2026-07-02T10:00:00Z"), providerStatus: "in_transit", description: "In transit" },
  ],
};

function transaction(options: { previousSyncAt?: Date | null; status?: ShipmentStatus; imported?: number } = {}) {
  const shipmentUpdate = vi.fn();
  const createMany = vi.fn().mockResolvedValue({ count: options.imported ?? 2 });
  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if (where.source === TrackingEventSource.CARRIER) return options.previousSyncAt ? { occurredAt: new Date("2026-07-02T10:00:00Z") } : null;
    if (where.source === TrackingEventSource.ADMIN) return null;
    if (where.status === ShipmentStatus.DELIVERED) return null;
    return { status: ShipmentStatus.PENDING, occurredAt: new Date("2026-08-01T10:00:00Z") };
  });
  return {
    tx: {
      shipment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          status: options.status ?? ShipmentStatus.PENDING,
          carrierLastSuccessfulSyncAt: options.previousSyncAt ?? null,
        }),
        update: shipmentUpdate,
      },
      trackingEvent: { findFirst, createMany },
    },
    shipmentUpdate,
    createMany,
  };
}

describe("authoritative carrier status reconciliation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies an explicit current milestone over a newer SYSTEM event while retaining history", async () => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction();
    await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SHIP24_SAMPLE_IN_TRANSIT_828", providerCarrierCode: null },
      "ship24",
      julyInfo,
      new Date("2026-08-10T12:00:01Z"),
    );

    expect(database.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ source: TrackingEventSource.CARRIER, occurredAt: new Date("2026-07-01T10:00:00Z") }),
        expect.objectContaining({ source: TrackingEventSource.CARRIER, occurredAt: new Date("2026-07-02T10:00:00Z") }),
      ]),
      skipDuplicates: true,
    }));
    expect(database.shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ShipmentStatus.IN_TRANSIT }),
    }));
    expect(database.tx.trackingEvent).not.toHaveProperty("delete");
  });

  it("keeps the authoritative status and creates no duplicates on a repeated synchronization", async () => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction({
      previousSyncAt: new Date("2026-08-10T12:00:01Z"),
      status: ShipmentStatus.IN_TRANSIT,
      imported: 0,
    });
    const result = await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SHIP24_SAMPLE_IN_TRANSIT_828", providerCarrierCode: null },
      "ship24",
      julyInfo,
      new Date("2026-08-10T12:00:02Z"),
    );
    expect(result.imported).toBe(0);
    expect(database.shipmentUpdate.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("rejects stale provider state and preserves a genuinely newer administrator update", async () => {
    const { reconcileCarrierStatus } = await import("@/lib/carrier-tracking");
    const base = {
      hasAuthoritativeStatus: true,
      authoritativeStatus: ShipmentStatus.IN_TRANSIT,
      authoritativeObservedAt: new Date("2026-08-10T12:00:00Z"),
      authoritativeEvidenceAt: new Date("2026-07-02T10:00:00Z"),
      previousSyncAt: null,
      newestCarrierBefore: new Date("2026-07-03T10:00:00Z"),
      newestAdmin: null,
      fallbackNewest: { status: ShipmentStatus.PENDING, occurredAt: new Date("2026-08-01T10:00:00Z") },
      newestDeliveredAt: null,
    };
    expect(reconcileCarrierStatus(base)).toBeNull();
    expect(reconcileCarrierStatus({
      ...base,
      newestCarrierBefore: null,
      newestAdmin: new Date("2026-07-03T10:00:00Z"),
    })).toBeNull();
  });

  it("preserves delivery time and supports later non-linear authoritative states", async () => {
    const { reconcileCarrierStatus } = await import("@/lib/carrier-tracking");
    const deliveredAt = new Date("2026-07-02T10:00:00Z");
    const base = {
      hasAuthoritativeStatus: true,
      authoritativeObservedAt: new Date("2026-07-02T11:00:00Z"),
      authoritativeEvidenceAt: deliveredAt,
      previousSyncAt: null,
      newestCarrierBefore: null,
      newestAdmin: null,
      fallbackNewest: null,
      newestDeliveredAt: deliveredAt,
    };
    expect(reconcileCarrierStatus({ ...base, authoritativeStatus: ShipmentStatus.DELIVERED })).toEqual({ status: ShipmentStatus.DELIVERED, deliveredAt });
    expect(reconcileCarrierStatus({ ...base, authoritativeStatus: ShipmentStatus.RETURNED })).toEqual({ status: ShipmentStatus.RETURNED });
  });
});

describe("carrier synchronization failures", () => {
  it("records only the safe error state without changing shipment status", async () => {
    findUnique.mockResolvedValue({
      trackingNumber: "SHIP24_SAMPLE_IN_TRANSIT_828",
      providerCarrierCode: null,
      providerTrackerId: "tracker",
      trackingProvider: "ship24",
      carrierConnectionStatus: CarrierConnectionStatus.ACTIVE,
      status: ShipmentStatus.IN_TRANSIT,
    });
    const provider: TrackingProvider = {
      name: "ship24",
      enabled: true,
      registerTracking: vi.fn(),
      getTrackingInfo: vi.fn().mockRejectedValue(new TrackingProviderError(TRACKING_ERROR_CODES.UNAVAILABLE)),
    };
    const { syncShipmentTracking } = await import("@/lib/carrier-tracking");
    await expect(syncShipmentTracking("shipment", provider)).rejects.toMatchObject({ code: TRACKING_ERROR_CODES.UNAVAILABLE });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ status: expect.anything() }),
    }));
    expect(update.mock.calls[0][0].data).toMatchObject({ carrierLastErrorCode: TRACKING_ERROR_CODES.UNAVAILABLE });
  });
});
