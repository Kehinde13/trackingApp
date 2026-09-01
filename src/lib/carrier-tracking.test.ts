import { beforeEach, describe, expect, it, vi } from "vitest";

import { CarrierConnectionStatus, ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { TRACKING_ERROR_CODES, TrackingProviderError, type TrackingInfo, type TrackingProvider } from "@/lib/tracking-provider";

const findUnique = vi.fn();
const update = vi.fn();
const runTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shipment: { findUnique, update },
    $transaction: runTransaction,
  },
}));

const julyInfo: TrackingInfo = {
  currentStatus: {
    providerStatus: "in_transit",
    providerGeneratedAt: new Date("2026-07-02T12:00:00Z"),
  },
  events: [
    { stableId: "info", occurredAt: new Date("2026-07-01T10:00:00Z"), providerStatus: "info_received", description: "Information received" },
    { stableId: "transit", occurredAt: new Date("2026-07-02T10:00:00Z"), providerStatus: "in_transit", description: "In transit" },
  ],
};

const julyInfoWithoutGeneratedAt: TrackingInfo = {
  currentStatus: { providerStatus: "in_transit" },
  snapshotAbsenceReason: "snapshot_missing_generated_at",
  events: julyInfo.events,
};

function transaction(options: { previousSyncAt?: Date | null; status?: ShipmentStatus; imported?: number; adminAt?: Date | null } = {}) {
  const shipmentUpdate = vi.fn();
  const createMany = vi.fn().mockResolvedValue({ count: options.imported ?? 2 });
  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if (where.source === TrackingEventSource.CARRIER) return options.previousSyncAt ? { occurredAt: new Date("2026-07-02T10:00:00Z") } : null;
    if (where.source === TrackingEventSource.ADMIN) return options.adminAt ? { occurredAt: options.adminAt } : null;
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

  it.each([
    ["snapshot_absent", "snapshot_absent"],
    ["snapshot_missing_generated_at", "snapshot_missing_generated_at"],
    ["snapshot_invalid_generated_at", "snapshot_invalid_generated_at"],
    [undefined, "provider_without_snapshot"],
  ] as const)("returns the safe absence outcome %s without changing fallback behavior", async (reason, outcome) => {
    const { reconcileCarrierStatus } = await import("@/lib/carrier-tracking");
    expect(reconcileCarrierStatus({
      hasAuthoritativeStatus: false,
      ...(reason ? { snapshotAbsenceReason: reason } : {}),
      storedStatus: ShipmentStatus.PENDING,
      authoritativeStatus: null,
      authoritativeFreshnessAt: null,
      authoritativeProviderGeneratedAt: null,
      previousSyncAt: null,
      newestCarrierBefore: null,
      newestAdmin: null,
      fallbackNewest: null,
      newestDeliveredAt: null,
    })).toEqual({ statusUpdate: null, outcome });
  });

  it("reports malformed or unmapped authoritative snapshots without changing status", async () => {
    const { reconcileCarrierStatus } = await import("@/lib/carrier-tracking");
    const base = {
      hasAuthoritativeStatus: true,
      storedStatus: ShipmentStatus.PENDING,
      authoritativeStatus: ShipmentStatus.IN_TRANSIT,
      authoritativeFreshnessAt: new Date("2026-08-10T12:00:00Z"),
      authoritativeProviderGeneratedAt: new Date("2026-08-10T11:00:00Z"),
      previousSyncAt: null,
      newestCarrierBefore: null,
      newestAdmin: null,
      fallbackNewest: null,
      newestDeliveredAt: null,
    };
    expect(reconcileCarrierStatus({ ...base, authoritativeStatus: null })).toEqual({ statusUpdate: null, outcome: "snapshot_status_unmapped" });
    expect(reconcileCarrierStatus({ ...base, authoritativeProviderGeneratedAt: null })).toEqual({ statusUpdate: null, outcome: "snapshot_missing_generated_at" });
    expect(reconcileCarrierStatus({ ...base, authoritativeFreshnessAt: null })).toEqual({ statusUpdate: null, outcome: "snapshot_absent" });
  });

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

  it("treats a successful pull as freshly observed even when provider generation and events are historical", async () => {
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
      "pull",
    );
    expect(result.imported).toBe(0);
    expect(result.reconciliationOutcome).toBe("already_current");
    expect(database.shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: ShipmentStatus.IN_TRANSIT,
        carrierLastSuccessfulSyncAt: new Date("2026-08-10T12:00:02Z"),
      }),
    }));
  });

  it("reconciles an explicit snapshot when a successful pull returns zero events", async () => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction({
      previousSyncAt: new Date("2026-08-10T12:00:01Z"),
      imported: 0,
    });
    const result = await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SAFE_TEST_NUMBER", providerCarrierCode: null },
      "ship24",
      { ...julyInfo, events: [] },
      new Date("2026-08-10T12:00:02Z"),
      "pull",
    );

    expect(result.imported).toBe(0);
    expect(result.reconciliationOutcome).toBe("applied");
    expect(database.createMany).not.toHaveBeenCalled();
    expect(database.shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: ShipmentStatus.IN_TRANSIT,
        carrierLastSuccessfulSyncAt: new Date("2026-08-10T12:00:02Z"),
        carrierLastErrorCode: null,
      }),
    }));
  });

  it("applies a pulled milestone without provider generation time when all events are duplicates", async () => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction({ previousSyncAt: new Date("2026-08-10T12:00:01Z"), imported: 0 });
    const result = await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SAFE_TEST_NUMBER", providerCarrierCode: null },
      "ship24",
      julyInfoWithoutGeneratedAt,
      new Date("2026-08-10T12:00:02Z"),
      "pull",
    );

    expect(result).toMatchObject({ imported: 0, warning: null, reconciliationOutcome: "applied" });
    expect(database.shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ShipmentStatus.IN_TRANSIT }),
    }));
  });

  it("keeps a repeated missing-timestamp pull idempotent", async () => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction({
      previousSyncAt: new Date("2026-08-10T12:00:01Z"),
      status: ShipmentStatus.IN_TRANSIT,
      imported: 0,
    });
    const result = await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SAFE_TEST_NUMBER", providerCarrierCode: null },
      "ship24",
      { ...julyInfoWithoutGeneratedAt, events: [] },
      new Date("2026-08-10T12:00:02Z"),
      "pull",
    );

    expect(result).toMatchObject({ imported: 0, reconciliationOutcome: "already_current" });
    expect(database.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["snapshot_missing_generated_at", "snapshot_missing_generated_at"],
    ["snapshot_invalid_generated_at", "snapshot_invalid_generated_at"],
  ] as const)("rejects a webhook with %s", async (snapshotAbsenceReason, expected) => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction({ previousSyncAt: new Date("2026-08-10T12:00:01Z"), imported: 0 });
    const result = await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SAFE_TEST_NUMBER", providerCarrierCode: null },
      "ship24",
      { currentStatus: { providerStatus: "in_transit" }, snapshotAbsenceReason, events: [] },
      new Date("2026-08-10T12:00:02Z"),
      "webhook",
    );
    expect(result.reconciliationOutcome).toBe(expected);
    expect(database.shipmentUpdate.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("does not apply the missing-timestamp pull fallback to an invalid timestamp", async () => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction({ imported: 0 });
    const result = await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SAFE_TEST_NUMBER", providerCarrierCode: null },
      "ship24",
      {
        currentStatus: { providerStatus: "in_transit" },
        snapshotAbsenceReason: "snapshot_invalid_generated_at",
        events: [],
      },
      new Date("2026-08-10T12:00:02Z"),
      "pull",
    );
    expect(result.reconciliationOutcome).toBe("snapshot_invalid_generated_at");
    expect(database.shipmentUpdate.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("does not let the pull fallback bypass a newer administrator authority time", async () => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction({ adminAt: new Date("2026-08-10T12:00:03Z"), imported: 0 });
    const result = await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SAFE_TEST_NUMBER", providerCarrierCode: null },
      "ship24",
      { ...julyInfoWithoutGeneratedAt, events: [] },
      new Date("2026-08-10T12:00:02Z"),
      "pull",
    );
    expect(result.reconciliationOutcome).toBe("admin_precedence");
    expect(database.shipmentUpdate.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("preserves event-based reconciliation when a zero-event response has no snapshot", async () => {
    const { importCarrierTrackingInfo } = await import("@/lib/carrier-tracking");
    const database = transaction({ imported: 0 });
    const result = await importCarrierTrackingInfo(
      database.tx as never,
      { id: "shipment", trackingNumber: "SAFE_TEST_NUMBER", providerCarrierCode: null },
      "ship24",
      { events: [] },
      new Date("2026-08-10T12:00:02Z"),
      "pull",
    );

    expect(result.imported).toBe(0);
    expect(result.reconciliationOutcome).toBe("provider_without_snapshot");
    expect(database.shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ShipmentStatus.PENDING }),
    }));
  });

  it("rejects stale provider state and preserves a genuinely newer administrator update", async () => {
    const { reconcileCarrierStatus } = await import("@/lib/carrier-tracking");
    const base = {
      hasAuthoritativeStatus: true,
      storedStatus: ShipmentStatus.PENDING,
      authoritativeStatus: ShipmentStatus.IN_TRANSIT,
      authoritativeFreshnessAt: new Date("2026-08-10T12:00:00Z"),
      authoritativeProviderGeneratedAt: new Date("2026-07-02T10:00:00Z"),
      previousSyncAt: null,
      newestCarrierBefore: new Date("2026-07-03T10:00:00Z"),
      newestAdmin: null,
      fallbackNewest: { status: ShipmentStatus.PENDING, occurredAt: new Date("2026-08-01T10:00:00Z") },
      newestDeliveredAt: null,
    };
    expect(reconcileCarrierStatus(base)).toEqual({ statusUpdate: null, outcome: "stale_carrier" });
    expect(reconcileCarrierStatus({
      ...base,
      newestCarrierBefore: null,
      newestAdmin: new Date("2026-07-03T10:00:00Z"),
    })).toEqual({ statusUpdate: null, outcome: "admin_precedence" });
  });

  it("orders webhook snapshots by provider generation time instead of receipt time", async () => {
    const { reconcileCarrierStatus } = await import("@/lib/carrier-tracking");
    const base = {
      hasAuthoritativeStatus: true,
      storedStatus: ShipmentStatus.PENDING,
      authoritativeStatus: ShipmentStatus.IN_TRANSIT,
      authoritativeProviderGeneratedAt: new Date("2026-08-10T11:00:00Z"),
      previousSyncAt: new Date("2026-08-10T12:00:00Z"),
      newestCarrierBefore: new Date("2026-08-10T10:00:00Z"),
      newestAdmin: null,
      fallbackNewest: null,
      newestDeliveredAt: null,
    };

    expect(reconcileCarrierStatus({
      ...base,
      authoritativeFreshnessAt: new Date("2026-08-10T11:59:59Z"),
    })).toEqual({ statusUpdate: null, outcome: "stale_snapshot" });
    expect(reconcileCarrierStatus({
      ...base,
      authoritativeFreshnessAt: new Date("2026-08-10T12:00:01Z"),
    })).toEqual({ statusUpdate: { status: ShipmentStatus.IN_TRANSIT }, outcome: "applied" });
  });

  it("keeps a genuinely newer administrator update authoritative during provider reconciliation", async () => {
    const { reconcileCarrierStatus } = await import("@/lib/carrier-tracking");
    expect(reconcileCarrierStatus({
      hasAuthoritativeStatus: true,
      storedStatus: ShipmentStatus.PENDING,
      authoritativeStatus: ShipmentStatus.IN_TRANSIT,
      authoritativeFreshnessAt: new Date("2026-08-20T12:00:00Z"),
      authoritativeProviderGeneratedAt: new Date("2026-08-20T10:00:00Z"),
      previousSyncAt: new Date("2026-08-19T12:00:00Z"),
      newestCarrierBefore: null,
      newestAdmin: new Date("2026-08-20T11:00:00Z"),
      fallbackNewest: { status: ShipmentStatus.DELAYED, occurredAt: new Date("2026-08-20T11:00:00Z") },
      newestDeliveredAt: null,
    })).toEqual({ statusUpdate: null, outcome: "admin_precedence" });
  });

  it("preserves delivery time and supports later non-linear authoritative states", async () => {
    const { reconcileCarrierStatus } = await import("@/lib/carrier-tracking");
    const deliveredAt = new Date("2026-07-02T10:00:00Z");
    const base = {
      hasAuthoritativeStatus: true,
      storedStatus: ShipmentStatus.PENDING,
      authoritativeFreshnessAt: new Date("2026-07-02T11:00:00Z"),
      authoritativeProviderGeneratedAt: deliveredAt,
      previousSyncAt: null,
      newestCarrierBefore: null,
      newestAdmin: null,
      fallbackNewest: null,
      newestDeliveredAt: deliveredAt,
    };
    expect(reconcileCarrierStatus({ ...base, authoritativeStatus: ShipmentStatus.DELIVERED })).toEqual({ statusUpdate: { status: ShipmentStatus.DELIVERED, deliveredAt }, outcome: "applied" });
    expect(reconcileCarrierStatus({ ...base, authoritativeStatus: ShipmentStatus.RETURNED })).toEqual({ statusUpdate: { status: ShipmentStatus.RETURNED }, outcome: "applied" });
    expect(reconcileCarrierStatus({ ...base, authoritativeStatus: ShipmentStatus.CANCELLED })).toEqual({ statusUpdate: { status: ShipmentStatus.CANCELLED }, outcome: "applied" });
    expect(reconcileCarrierStatus({ ...base, authoritativeStatus: ShipmentStatus.EXCEPTION })).toEqual({ statusUpdate: { status: ShipmentStatus.EXCEPTION }, outcome: "applied" });
  });
});

describe("carrier synchronization failures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigns the current-status observation time on the server after a successful provider pull", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
    findUnique.mockResolvedValue({
      trackingNumber: "SHIP24_SAMPLE_IN_TRANSIT_828",
      providerCarrierCode: null,
      providerTrackerId: "tracker",
      trackingProvider: "ship24",
      carrierConnectionStatus: CarrierConnectionStatus.ACTIVE,
    });
    const provider: TrackingProvider = {
      name: "ship24",
      enabled: true,
      registerTracking: vi.fn(),
      getTrackingInfo: vi.fn().mockResolvedValue(julyInfoWithoutGeneratedAt),
    };
    const database = transaction({ previousSyncAt: new Date("2026-08-19T12:00:00Z"), imported: 0 });
    runTransaction.mockImplementation(async (callback) => callback(database.tx));

    const { syncShipmentTracking } = await import("@/lib/carrier-tracking");
    await syncShipmentTracking("shipment", provider);

    expect(database.shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: ShipmentStatus.IN_TRANSIT,
        carrierLastSuccessfulSyncAt: new Date("2026-08-20T12:00:00Z"),
      }),
    }));
    vi.useRealTimers();
  });

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
