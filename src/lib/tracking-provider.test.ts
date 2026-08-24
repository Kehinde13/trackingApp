import { describe, expect, it } from "vitest";

import { DisabledTrackingProvider } from "@/lib/disabled-tracking-provider";
import { FakeTrackingProvider } from "@/lib/fake-tracking-provider";
import { map17TrackStatus } from "@/lib/carrier-status-mapping";
import { ShipmentStatus } from "@/generated/prisma/enums";
import { createTrackingProvider } from "@/lib/tracking-provider-config";
import { TRACKING_ERROR_CODES, carrierEventId } from "@/lib/tracking-provider";

const event = {
  occurredAt: new Date("2026-08-20T10:00:00Z"),
  providerStatus: "InTransit",
  providerSubStatus: "InTransit_PickedUp",
  description: "  Parcel   collected ",
  location: " Lagos ",
};

describe("tracking provider foundation", () => {
  it("selects disabled unless 17TRACK is explicitly configured", () => {
    expect(createTrackingProvider({ provider: "disabled", apiKey: "secret" })).toBeInstanceOf(DisabledTrackingProvider);
    expect(createTrackingProvider({ provider: "17track", apiKey: "" })).toBeInstanceOf(DisabledTrackingProvider);
    expect(createTrackingProvider({ provider: "unexpected", apiKey: "secret" })).toBeInstanceOf(DisabledTrackingProvider);
    expect(createTrackingProvider({ provider: "17track", apiKey: "secret" }).name).toBe("17track");
  });

  it("rejects disabled operations with a safe code", async () => {
    const provider = new DisabledTrackingProvider();
    await expect(provider.registerTracking({ trackingNumber: "TEST-12345" })).rejects.toMatchObject({ code: TRACKING_ERROR_CODES.DISABLED });
  });

  it("provides a quota-free fake provider", async () => {
    const provider = new FakeTrackingProvider({ carrierCode: "9999", events: [event] });
    expect(await provider.getTrackingInfo({ trackingNumber: "TEST-12345" })).toMatchObject({ carrierCode: "9999", events: [event] });
  });

  it.each([
    ["InfoReceived", undefined, ShipmentStatus.INFO_RECEIVED],
    ["InTransit", "InTransit_PickedUp", ShipmentStatus.PICKED_UP],
    ["InTransit", "InTransit_CustomsProcessing", ShipmentStatus.CUSTOMS],
    ["OutForDelivery", undefined, ShipmentStatus.OUT_FOR_DELIVERY],
    ["Delivered", undefined, ShipmentStatus.DELIVERED],
    ["Exception", "Exception_Delayed", ShipmentStatus.DELAYED],
    ["Exception", "Exception_Returned", ShipmentStatus.RETURNED],
    ["NewStatus", undefined, null],
  ])("maps %s/%s explicitly", (status, subStatus, expected) => {
    expect(map17TrackStatus(status, subStatus)).toBe(expected);
  });

  it("creates deterministic normalized fallback identifiers", () => {
    const first = carrierEventId("17track", "TEST-12345", event);
    const second = carrierEventId("17track", "TEST-12345", { ...event, description: "parcel collected", location: "lagos" });
    expect(first).toBe(second);
    expect(first).toMatch(/^17track:[a-f0-9]{64}$/);
  });
});
