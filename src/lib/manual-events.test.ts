import "dotenv/config";

import { describe, expect, it } from "vitest";

import { ShipmentStatus } from "@/generated/prisma/enums";
import type { ManualEventInput } from "./manual-event-validation";
import { getNewestStatusUpdate, shouldUpdateShipmentStatus } from "./manual-events";

const input = (status: ShipmentStatus, occurredAt: Date): ManualEventInput => ({
  status,
  occurredAt,
  description: "Status changed",
  location: null,
  city: null,
  countryCode: null,
});

describe("manual event status rules", () => {
  const newest = new Date("2026-08-23T10:00:00Z");

  it("updates for a newest or equally recent event, but not a backdated event", () => {
    expect(shouldUpdateShipmentStatus(new Date("2026-08-23T10:01:00Z"), newest)).toBe(true);
    expect(shouldUpdateShipmentStatus(newest, newest)).toBe(true);
    expect(shouldUpdateShipmentStatus(new Date("2026-08-23T09:59:00Z"), newest)).toBe(false);
  });

  it("sets deliveredAt only for a newest delivered event", () => {
    const deliveredAt = new Date("2026-08-23T10:01:00Z");
    expect(getNewestStatusUpdate(input(ShipmentStatus.DELIVERED, deliveredAt), newest)).toEqual({ status: ShipmentStatus.DELIVERED, deliveredAt });
    expect(getNewestStatusUpdate(input(ShipmentStatus.DELIVERED, new Date("2026-08-23T09:00:00Z")), newest)).toBeNull();
  });

  it("updates a newest return without clearing the historical delivery timestamp", () => {
    expect(getNewestStatusUpdate(input(ShipmentStatus.RETURNED, new Date("2026-08-23T11:00:00Z")), newest)).toEqual({ status: ShipmentStatus.RETURNED });
  });
});
