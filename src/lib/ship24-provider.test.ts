import { describe, expect, it, vi } from "vitest";
import { normalizeShip24Tracking, parseShip24Timestamp, Ship24Provider, type Ship24Tracking } from "@/lib/ship24-provider";
import { TRACKING_ERROR_CODES } from "@/lib/tracking-provider";

const tracker = { trackerId: "trk_test_001", trackingNumber: "FAKE123456", clientTrackerId: "parceltrack:00000000-0000-4000-8000-000000000001", courierCode: "mock-courier" };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("Ship24 provider", () => {
  it("registers a minimal tracker with bearer authentication and no recipient data", async () => {
    const sampleTrackingNumber = "SHIP24_SAMPLE_IN_TRANSIT_828";
    const fetcher = vi.fn(async () => response({ data: { tracker: { ...tracker, trackingNumber: sampleTrackingNumber } } }));
    const provider = new Ship24Provider("invented-api-key", fetcher as typeof fetch, async () => {});
    await expect(provider.registerTracking({ trackingNumber: sampleTrackingNumber, clientTrackerId: tracker.clientTrackerId, destinationCountryCode: "NG" })).resolves.toEqual({ providerTrackerId: tracker.trackerId, carrierCode: "mock-courier" });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer invented-api-key" });
    expect(JSON.parse(String(init?.body))).toEqual({ trackingNumber: sampleTrackingNumber, clientTrackerId: tracker.clientTrackerId, destinationCountryCode: "NG" });
    expect(String(init?.body)).not.toMatch(/recipient|email|telephone|address|postcode/i);
  });
  it("retrieves results only by the stored tracker id", async () => {
    const fetcher = vi.fn(async () => response({ data: { trackings: [{ metadata: { generatedAt: "2026-08-20T11:00:00Z" }, tracker, shipment: { statusCode: null, statusMilestone: "in_transit" }, events: [{ eventId: "evt-1", status: "In transit", occurrenceDatetime: "2026-08-20T10:00:00Z", order: 1, location: "Test hub", courierCode: "mock-courier", statusCode: "transit_handover", statusMilestone: "in_transit" }] }] } }));
    const result = await new Ship24Provider("invented", fetcher as typeof fetch, async () => {}).getTrackingInfo({ trackingNumber: "FAKE123456", providerTrackerId: tracker.trackerId });
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe(`https://api.ship24.com/public/v1/trackers/${tracker.trackerId}/results`);
    expect(result.events[0]).toMatchObject({ stableId: "evt-1", occurredAt: new Date("2026-08-20T10:00:00Z"), providerEventOrder: 1, providerStatus: "in_transit" });
    expect(result.currentStatus).toEqual({ providerStatus: "in_transit", providerGeneratedAt: new Date("2026-08-20T11:00:00Z") });
  });
  it.each<[Ship24Tracking, string]>([
    [{ tracker, events: [] }, "snapshot_absent"],
    [{ tracker, shipment: { statusCode: null, statusMilestone: "in_transit" }, events: [] }, "snapshot_missing_generated_at"],
    [{ metadata: { generatedAt: "not-a-valid-date" }, tracker, shipment: { statusCode: null, statusMilestone: "in_transit" }, events: [] }, "snapshot_invalid_generated_at"],
  ])("reports a safe snapshot normalization outcome", (tracking, outcome) => {
    const normalized = normalizeShip24Tracking(tracking);
    expect(normalized.snapshotAbsenceReason).toBe(outcome);
    if (tracking.shipment) expect(normalized.currentStatus?.providerStatus).toBe("in_transit");
  });
  it.each([["2026-08-20T10:00:00Z", "2026-08-20T10:00:00.000Z"], ["2026-08-20T10:00:00+02:00", "2026-08-20T08:00:00.000Z"], ["2026-08-20T10:00:00", null], ["2026-08-20", null]])("preserves timestamp semantics for %s", (input, expected) => {
    const parsed = parseShip24Timestamp(input);
    expect(parsed?.providerOccurredAt).toBe(input);
    expect(parsed?.occurredAt?.toISOString() ?? null).toBe(expected);
  });
  it("rejects impossible dates and strips recipient fields", () => {
    expect(parseShip24Timestamp("2026-02-30T10:00:00")).toBeNull();
    const normalized = normalizeShip24Tracking({ metadata: { generatedAt: "2026-08-20T11:00:00Z" }, tracker, shipment: { statusCode: "exception_return", statusMilestone: "exception" }, events: [{ eventId: "evt", status: "Moving", occurrenceDatetime: "2026-08-20", statusMilestone: "future_status", recipient: { name: "Never retain" } } as never] });
    expect(JSON.stringify(normalized)).not.toContain("Never retain");
    expect(normalized.currentStatus).toMatchObject({ providerStatus: "exception", providerSubStatus: "exception_return" });
  });
  it("returns safe errors", async () => {
    const provider = new Ship24Provider("never-leak", async () => response({ private: "FAKE123456" }, 401) as never, async () => {});
    await expect(provider.registerTracking({ trackingNumber: "FAKE123456", clientTrackerId: tracker.clientTrackerId })).rejects.toMatchObject({ code: TRACKING_ERROR_CODES.AUTHENTICATION, message: TRACKING_ERROR_CODES.AUTHENTICATION });
  });
});
