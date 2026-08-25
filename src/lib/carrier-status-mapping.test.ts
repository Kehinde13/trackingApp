import { describe, expect, it } from "vitest";
import { ShipmentStatus } from "@/generated/prisma/enums";
import { mapShip24Status } from "@/lib/carrier-status-mapping";

describe("Ship24 status mapping", () => {
  it.each([
    ["pending", undefined, ShipmentStatus.PENDING], ["info_received", undefined, ShipmentStatus.INFO_RECEIVED],
    ["in_transit", undefined, ShipmentStatus.IN_TRANSIT], ["out_for_delivery", undefined, ShipmentStatus.OUT_FOR_DELIVERY],
    ["failed_attempt", undefined, ShipmentStatus.EXCEPTION], ["available_for_pickup", undefined, ShipmentStatus.IN_TRANSIT],
    ["delivered", undefined, ShipmentStatus.DELIVERED], ["exception", undefined, ShipmentStatus.EXCEPTION],
    ["exception", "exception_return", ShipmentStatus.RETURNED], ["pending", "data_order_cancelled", ShipmentStatus.CANCELLED],
  ])("maps %s / %s", (milestone, code, status) => expect(mapShip24Status(milestone!, code)).toBe(status));
  it("does not guess unknown status", () => expect(mapShip24Status("future_status", "future_code")).toBeNull());
});
