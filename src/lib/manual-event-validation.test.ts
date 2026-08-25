import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { manualEventSchema } from "./manual-event-validation";

const now = new Date("2026-08-23T12:00:00.000Z");
const valid = {
  status: "IN_TRANSIT",
  description: " Package reached the sorting centre. ",
  location: " Main distribution hub ",
  city: " Lagos ",
  countryCode: " ng ",
  occurredAt: "2026-08-23T11:30:00.000Z",
};

describe("manualEventSchema", () => {
  beforeEach(() => vi.setSystemTime(now));
  afterEach(() => vi.useRealTimers());

  it("requires a 3–500 character trimmed description", () => {
    expect(manualEventSchema.safeParse({ ...valid, description: "  " }).success).toBe(false);
    expect(manualEventSchema.safeParse({ ...valid, description: " x ".repeat(501) }).success).toBe(false);
    expect(manualEventSchema.parse(valid).description).toBe("Package reached the sorting centre.");
  });

  it("normalizes country codes and blank optional fields", () => {
    const parsed = manualEventSchema.parse({ ...valid, location: "", city: "", countryCode: " ng " });
    expect(parsed).toMatchObject({ location: null, city: null, countryCode: "NG" });
  });

  it.each([
    [{ ...valid, countryCode: "NGA" }, "country"],
    [{ ...valid, status: "SHIPPED" }, "status"],
    [{ ...valid, occurredAt: "not-a-date" }, "date"],
    [{ ...valid, description: "unsafe\u0000text" }, "control character"],
  ])("rejects invalid %s input", (input) => {
    expect(manualEventSchema.safeParse(input).success).toBe(false);
  });

  it("rejects dates over ten minutes in the future", () => {
    expect(manualEventSchema.safeParse({ ...valid, occurredAt: "2026-08-23T12:11:00.000Z" }).success).toBe(false);
  });

  it("accepts the internal canonical UTC form contract", () => {
    expect(manualEventSchema.safeParse({ ...valid, occurredAt: "2026-08-23T11:30:00.000Z" }).success).toBe(true);
  });

  it("rejects offset-free datetime-local values from clients", () => {
    expect(manualEventSchema.safeParse({ ...valid, occurredAt: "2026-08-23T11:30" }).success).toBe(false);
  });

  it("rejects numeric offsets as noncanonical internal form input", () => {
    expect(manualEventSchema.safeParse({ ...valid, occurredAt: "2026-08-23T11:30:00+01:00" }).success).toBe(false);
  });

  it("accepts reasonable history and rejects dates over ten years old", () => {
    expect(manualEventSchema.safeParse({ ...valid, occurredAt: "2021-01-01T00:00:00.000Z" }).success).toBe(true);
    expect(manualEventSchema.safeParse({ ...valid, occurredAt: "2015-01-01T00:00:00.000Z" }).success).toBe(false);
  });

  it("strips forged source, actor, shipment, provider, token, and payload fields", () => {
    const parsed = manualEventSchema.parse({ ...valid, source: "CARRIER", createdById: "forged", shipmentId: "forged", providerEventId: "forged", publicToken: "forged", rawPayload: { unsafe: true } });
    expect(parsed).not.toHaveProperty("source");
    expect(parsed).not.toHaveProperty("createdById");
    expect(parsed).not.toHaveProperty("shipmentId");
    expect(parsed).not.toHaveProperty("rawPayload");
  });
});
