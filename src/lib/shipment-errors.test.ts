import { describe, expect, it } from "vitest";

import { mapShipmentWriteError } from "./shipment-errors";

describe("mapShipmentWriteError", () => {
  it("maps duplicate references without exposing database details", () => {
    expect(
      mapShipmentWriteError({ code: "P2002", meta: { target: ["reference"] } }),
    ).toEqual({
      message: "A package with this reference already exists.",
      fieldErrors: { reference: ["This reference is already in use."] },
    });
  });

  it("maps duplicate carrier/tracking combinations", () => {
    const result = mapShipmentWriteError({
      code: "P2002",
      meta: { target: ["carrierCode", "trackingNumber"] },
    });
    expect(result.message).toContain("carrier and tracking number");
    expect(result.fieldErrors?.trackingNumber).toBeDefined();
  });

  it("maps unique fields reported by the Prisma driver adapter", () => {
    const result = mapShipmentWriteError({
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: { constraint: { fields: ["reference"] } },
        },
      },
    });
    expect(result.fieldErrors?.reference).toBeDefined();
  });

  it("returns a generic message for unknown database errors", () => {
    expect(mapShipmentWriteError(new Error("secret database detail"))).toEqual({
      message: "Unable to save the package. Please try again.",
    });
  });
});
