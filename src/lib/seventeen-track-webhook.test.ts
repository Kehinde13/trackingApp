import { describe, expect, it } from "vitest";

import { parse17TrackWebhook } from "@/lib/seventeen-track-webhook-schema";

const item = {
  number: "TEST-12345",
  carrier: 3011,
  track_info: {
    tracking: {
      providers: [{ events: [{
        time_utc: "2026-08-20T10:00:00Z",
        description: "Parcel collected",
        location: "Lagos",
        stage: "InTransit",
        sub_status: "InTransit_PickedUp",
        address: { country: "NG", city: "Lagos", street: "discarded" },
        coordinates: { latitude: "discarded" },
      }] }],
    },
  },
  phone_number: "discarded",
};

describe("17TRACK webhook schemas", () => {
  it("validates supported update/stop payloads and discards extra fields", () => {
    const updated = parse17TrackWebhook({ event: "TRACKING_UPDATED", data: item, signature: "discarded" });
    expect(updated?.kind).toBe("updated");
    expect(JSON.stringify(updated)).not.toMatch(/phone_number|street|coordinates|signature/);
    expect(parse17TrackWebhook({ event: "TRACKING_STOPPED", data: { number: "TEST-12345", carrier: 3011, tag: "discarded" } })).toEqual({
      kind: "stopped",
      payload: { event: "TRACKING_STOPPED", data: { number: "TEST-12345", carrier: 3011 } },
    });
  });

  it("acknowledges safe unknown events and rejects invalid known payloads", () => {
    expect(parse17TrackWebhook({ event: "FUTURE_EVENT", data: { anything: true } })).toEqual({ kind: "unsupported" });
    expect(parse17TrackWebhook({ event: "TRACKING_UPDATED", data: { number: "bad" } })).toBeNull();
    expect(parse17TrackWebhook({ event: "tracking_updated", data: {} })).toBeNull();
  });
});
