import { describe, expect, it, vi } from "vitest";

import { SeventeenTrackProvider, isRetryableStatus } from "@/lib/seventeen-track-provider";
import { TRACKING_ERROR_CODES } from "@/lib/tracking-provider";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("17TRACK adapter", () => {
  it("normalizes registration and uses the fixed v2.4 endpoint", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ code: 0, data: { accepted: [{ number: "TEST-12345", carrier: 3011 }], rejected: [] } }));
    const provider = new SeventeenTrackProvider("top-secret", fetcher as typeof fetch, async () => {});
    await expect(provider.registerTracking({ trackingNumber: "TEST-12345" })).resolves.toEqual({ carrierCode: "3011" });
    expect(fetcher).toHaveBeenCalledWith("https://api.17track.net/track/v2.4/register", expect.objectContaining({ method: "POST", redirect: "error", body: '[{"number":"TEST-12345"}]' }));
  });

  it("normalizes safe event fields without retaining a response payload", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ code: 0, data: { accepted: [{ number: "TEST-12345", carrier: 3011, track_info: { tracking: { providers: [{ events: [{ time_utc: "2026-08-20T10:00:00Z", time_iso: null, description: "Parcel collected", location: "Lagos", stage: "InTransit", sub_status: "InTransit_PickedUp", address: { country: "NG", city: "Lagos" } }] }] } } }], rejected: [] } }));
    const result = await new SeventeenTrackProvider("secret", fetcher as typeof fetch).getTrackingInfo({ trackingNumber: "TEST-12345" });
    expect(result).toEqual({ carrierCode: "3011", events: [{ occurredAt: new Date("2026-08-20T10:00:00Z"), providerStatus: "InTransit", providerSubStatus: "InTransit_PickedUp", description: "Parcel collected", location: "Lagos", city: "Lagos", countryCode: "NG" }] });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("returns a safe schema error without leaking the key", async () => {
    const provider = new SeventeenTrackProvider("never-leak-me", async () => jsonResponse({ unexpected: true }) as never);
    await expect(provider.registerTracking({ trackingNumber: "TEST-12345" })).rejects.toMatchObject({ code: TRACKING_ERROR_CODES.INVALID_RESPONSE, message: TRACKING_ERROR_CODES.INVALID_RESPONSE });
  });

  it("aborts timed-out requests", async () => {
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const provider = new SeventeenTrackProvider("secret", fetcher as typeof fetch, async () => {}, 5);
    await expect(provider.registerTracking({ trackingNumber: "TEST-12345" })).rejects.toMatchObject({ code: TRACKING_ERROR_CODES.TIMEOUT });
  });

  it("retries only documented transient HTTP classes", async () => {
    expect([429, 500, 502, 503, 504].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 403, 404].some(isRetryableStatus)).toBe(false);
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({}, 503)).mockResolvedValueOnce(jsonResponse({ code: 0, data: { accepted: [{ number: "TEST-12345", carrier: 3011 }], rejected: [] } }));
    await new SeventeenTrackProvider("secret", fetcher, async () => {}).registerTracking({ trackingNumber: "TEST-12345" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
