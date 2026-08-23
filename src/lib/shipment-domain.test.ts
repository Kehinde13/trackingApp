import { describe, expect, it, vi } from "vitest";

import { ShipmentStatus } from "@/generated/prisma/enums";
import {
  generateShipmentReference,
  generateUniqueShipmentReference,
  isAttentionStatus,
  isInTransitStatus,
  maskTrackingNumber,
  normalizeCarrierCode,
  normalizeCountryCode,
  normalizeReference,
  normalizeTrackingNumber,
  parsePackageSearchParams,
} from "./shipment-domain";

describe("shipment normalization", () => {
  it("normalizes references to trimmed uppercase values", () => {
    expect(normalizeReference("  pt-order_12 ")).toBe("PT-ORDER_12");
  });

  it("normalizes carrier codes to trimmed lowercase values", () => {
    expect(normalizeCarrierCode("  DHL ")).toBe("dhl");
  });

  it("normalizes tracking numbers to uppercase without whitespace", () => {
    expect(normalizeTrackingNumber(" jd 01 23-45 ")).toBe("JD0123-45");
  });

  it("normalizes ISO country codes to uppercase", () => {
    expect(normalizeCountryCode(" ng ")).toBe("NG");
  });
});

describe("generated references", () => {
  it("uses a readable, random PT reference format", () => {
    expect(generateShipmentReference()).toMatch(/^PT-[A-F0-9]{6}-[A-F0-9]{6}$/);
  });

  it("checks uniqueness and retries a collision", async () => {
    const isTaken = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const reference = await generateUniqueShipmentReference(isTaken);

    expect(reference).toMatch(/^PT-/);
    expect(isTaken).toHaveBeenCalledTimes(2);
  });
});

describe("package search parameters", () => {
  it("parses safe search, status, carrier, and page values", () => {
    expect(
      parsePackageSearchParams({
        query: "  pt-demo ",
        status: "in_transit",
        carrier: " DHL ",
        page: "3",
      }),
    ).toEqual({ query: "pt-demo", status: ShipmentStatus.IN_TRANSIT, carrier: "dhl", page: 3 });
  });

  it("rejects unknown statuses and unsafe page values", () => {
    const parsed = parsePackageSearchParams({ status: "MOVING", page: "-8" });
    expect(parsed.status).toBeNull();
    expect(parsed.page).toBe(1);
  });
});

describe("shipment display helpers", () => {
  it("masks tracking numbers while preserving the final four characters", () => {
    expect(maskTrackingNumber("DEMO-DHL-0001")).toBe("••••••••0001");
    expect(maskTrackingNumber(null)).toBe("Not connected");
  });

  it("groups dashboard statuses correctly", () => {
    expect(isInTransitStatus(ShipmentStatus.PICKED_UP)).toBe(true);
    expect(isInTransitStatus(ShipmentStatus.CUSTOMS)).toBe(true);
    expect(isInTransitStatus(ShipmentStatus.DELIVERED)).toBe(false);
    expect(isAttentionStatus(ShipmentStatus.DELAYED)).toBe(true);
    expect(isAttentionStatus(ShipmentStatus.EXCEPTION)).toBe(true);
    expect(isAttentionStatus(ShipmentStatus.CANCELLED)).toBe(false);
  });
});
