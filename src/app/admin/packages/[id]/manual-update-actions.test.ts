import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAuthorizationError } from "@/lib/auth-guards";

const requireAdminForMutation = vi.fn();
const addManualTrackingEvent = vi.fn();

vi.mock("@/lib/admin-session", () => ({ requireAdminForMutation }));
vi.mock("@/lib/manual-events", () => {
  class ShipmentNotFoundError extends Error {}
  return { ShipmentNotFoundError, addManualTrackingEvent };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const shipmentId = "11111111-1111-4111-8111-111111111111";
const form = () => {
  const data = new FormData();
  data.set("status", "IN_TRANSIT");
  data.set("description", "Reached Lagos hub");
  data.set("location", "Sorting centre");
  data.set("city", "Lagos");
  data.set("countryCode", "NG");
  data.set("occurredAt", new Date().toISOString());
  data.set("source", "CARRIER");
  data.set("createdById", "forged-actor");
  return data;
};
const state = { success: false, message: "", fieldErrors: {}, values: { status: "IN_TRANSIT", description: "", location: "", city: "", countryCode: "", occurredAt: "" } };

describe("addManualUpdateAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("takes the actor from the admin session and ignores forged actor/source fields", async () => {
    requireAdminForMutation.mockResolvedValue({ user: { id: "real-admin", role: "admin" } });
    addManualTrackingEvent.mockResolvedValue({ id: "event" });
    const { addManualUpdateAction } = await import("./manual-update-actions");
    const result = await addManualUpdateAction(shipmentId, state, form());
    expect(result.success).toBe(true);
    expect(addManualTrackingEvent).toHaveBeenCalledWith(shipmentId, "real-admin", expect.not.objectContaining({ source: expect.anything(), createdById: expect.anything() }));
  });

  it("rejects unauthenticated and non-admin mutations before writing", async () => {
    requireAdminForMutation.mockRejectedValue(new AdminAuthorizationError());
    const { addManualUpdateAction } = await import("./manual-update-actions");
    const result = await addManualUpdateAction(shipmentId, state, form());
    expect(result.message).toBe("Administrator access is required.");
    expect(addManualTrackingEvent).not.toHaveBeenCalled();
  });
});
