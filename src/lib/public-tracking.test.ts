import { describe, expect, it } from "vitest";
import { ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { getPublicProgress, isValidPublicTrackingToken, maskPublicTrackingNumber, parsePublicTrackingInput, PUBLIC_SOURCE_LABELS } from "./public-tracking";

const token = "AbCdEf0123456789_-AbCdEf01234567";
describe("public tracking input", () => {
  it("recognizes exact generated-token format", () => { expect(isValidPublicTrackingToken(token)).toBe(true); });
  it.each(["", "short", `${token}x`, "PT-DEMO-001", "bad token", "x".repeat(500)])("rejects invalid token %s", (value) => expect(isValidPublicTrackingToken(value)).toBe(false));
  it("accepts only same-origin tracking URLs", () => {
    expect(parsePublicTrackingInput(`https://parcel.test/track/${token}`, "https://parcel.test")).toBe(token);
    expect(parsePublicTrackingInput(`https://evil.test/track/${token}`, "https://parcel.test")).toBeNull();
    expect(parsePublicTrackingInput(`//evil.test/track/${token}`, "https://parcel.test")).toBeNull();
    expect(parsePublicTrackingInput(`https://parcel.test/track/${token}?next=https://evil.test`, "https://parcel.test")).toBeNull();
  });
  it("masks tracking numbers", () => expect(maskPublicTrackingNumber("JD014600006542381234")).toMatch(/^•+1234$/));
  it("maps public source labels", () => expect(PUBLIC_SOURCE_LABELS).toEqual({ [TrackingEventSource.CARRIER]: "Carrier update", [TrackingEventSource.ADMIN]: "Shipping team update", [TrackingEventSource.SYSTEM]: "System update" }));
  it("separates attention states from delivery progress", () => {
    expect(getPublicProgress(ShipmentStatus.IN_TRANSIT)).toMatchObject({ kind: "standard", currentIndex: 3 });
    expect(getPublicProgress(ShipmentStatus.DELAYED)).toEqual({ kind: "attention", status: ShipmentStatus.DELAYED });
    expect(getPublicProgress(ShipmentStatus.EXCEPTION)).toEqual({ kind: "attention", status: ShipmentStatus.EXCEPTION });
  });
});
