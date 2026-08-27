import { describe, expect, it } from "vitest";

import { createPackageSchema, editPackageSchema } from "./shipment-validation";

const validInput = {
  reference: " pt-test-001 ",
  recipientName: " Demo Recipient ",
  carrierCode: " DHL ",
  carrierName: " DHL Express ",
  trackingNumber: " jd001-99 ",
  originCity: " Berlin ",
  originCountryCode: " de ",
  destinationCity: " Lagos ",
  destinationCountryCode: " ng ",
  estimatedDeliveryAt: "2026-09-15",
};

describe("createPackageSchema", () => {
  it("validates and normalizes a complete package", () => {
    const result = createPackageSchema.parse(validInput);
    expect(result.reference).toBe("PT-TEST-001");
    expect(result.carrierCode).toBe("dhl");
    expect(result.trackingNumber).toBe("JD001-99");
    expect(result.destinationCountryCode).toBe("NG");
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date);
  });

  it.each([
    ["SHIP24_SAMPLE_IN_TRANSIT_828", "SHIP24_SAMPLE_IN_TRANSIT_828"],
    [" ordinary12345 ", "ORDINARY12345"],
    ["track-12345", "TRACK-12345"],
  ])("accepts and safely normalizes tracking number %s", (input, expected) => {
    expect(createPackageSchema.parse({ ...validInput, trackingNumber: input }).trackingNumber).toBe(expected);
  });

  it("rejects empty and unsafe tracking numbers", () => {
    for (const input of ["", "   ", "AB 12345", "AB\u000012345", "AB/12345"]) {
      expect(createPackageSchema.safeParse({ ...validInput, trackingNumber: input }).success).toBe(false);
    }
  });

  it("converts blank optional fields to null", () => {
    const blank = Object.fromEntries(Object.keys(validInput).map((key) => [key, ""]));
    const result = createPackageSchema.parse({
      ...blank,
      trackingNumber: "SHIP24_SAMPLE_IN_TRANSIT_828",
    });
    expect(result.trackingNumber).toBe("SHIP24_SAMPLE_IN_TRANSIT_828");
    expect(Object.entries(result).filter(([key]) => key !== "trackingNumber").every(([, value]) => value === null)).toBe(true);
  });

  it("rejects invalid country codes, dates, and control characters", () => {
    const result = createPackageSchema.safeParse({
      ...validInput,
      recipientName: "Bad\u0000Name",
      destinationCountryCode: "NGA",
      estimatedDeliveryAt: "15/09/2026",
    });
    expect(result.success).toBe(false);
  });
});

describe("editPackageSchema", () => {
  it("accepts and preserves Ship24 sample underscores", () => {
    const result = editPackageSchema.parse({
      ...validInput,
      trackingNumber: " SHIP24_SAMPLE_IN_TRANSIT_828 ",
    });
    expect(result.trackingNumber).toBe("SHIP24_SAMPLE_IN_TRANSIT_828");
  });

  it("requires a package reference while allowing optional metadata", () => {
    const result = editPackageSchema.safeParse({ ...validInput, reference: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.reference).toBeDefined();
    }
  });

  it("does not mass-assign unsupported fields", () => {
    const result = editPackageSchema.parse({
      ...validInput,
      status: "DELIVERED",
      publicToken: "unsafe",
    });
    expect("status" in result).toBe(false);
    expect("publicToken" in result).toBe(false);
  });
});
