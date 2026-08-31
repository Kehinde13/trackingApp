import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAuthorizationError } from "@/lib/auth-guards";

const requireAdminForMutation = vi.fn();
const registerShipmentTracking = vi.fn();
const syncShipmentTracking = vi.fn();

vi.mock("@/lib/admin-session", () => ({ requireAdminForMutation }));
vi.mock("@/lib/carrier-tracking", () => ({
  CarrierTrackingOperationError: class CarrierTrackingOperationError extends Error { constructor(readonly code: string) { super(code); } },
  registerShipmentTracking,
  syncShipmentTracking,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const shipmentId = "11111111-1111-4111-8111-111111111111";
const state = { success: false, message: "" };

describe("carrier tracking administrator actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated registration before provider access", async () => {
    requireAdminForMutation.mockRejectedValue(new AdminAuthorizationError());
    const { registerCarrierAction } = await import("./carrier-tracking-actions");
    const result = await registerCarrierAction(shipmentId, state, new FormData());
    expect(result.message).toBe("Administrator access is required.");
    expect(registerShipmentTracking).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated synchronization before provider access", async () => {
    requireAdminForMutation.mockRejectedValue(new AdminAuthorizationError());
    const { syncCarrierAction } = await import("./carrier-tracking-actions");
    const result = await syncCarrierAction(shipmentId, state);
    expect(result.message).toBe("Administrator access is required.");
    expect(syncShipmentTracking).not.toHaveBeenCalled();
  });

  it("returns only the safe reconciliation outcome to an authenticated administrator", async () => {
    requireAdminForMutation.mockResolvedValue({ user: { role: "admin" } });
    syncShipmentTracking.mockResolvedValue({ imported: 0, warning: null, reconciliationOutcome: "stale_carrier" });
    const { syncCarrierAction } = await import("./carrier-tracking-actions");
    const result = await syncCarrierAction(shipmentId, state);
    expect(result).toEqual({
      success: true,
      message: "Synchronization complete. 0 new events imported. Status reconciliation: stale_carrier",
    });
  });
});
