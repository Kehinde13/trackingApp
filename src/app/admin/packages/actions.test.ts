import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminForMutation = vi.fn();
const createShipmentWithInitialEvent = vi.fn();
const updateShipmentMetadata = vi.fn();
const redirect = vi.fn();

vi.mock("@/lib/admin-session", () => ({ requireAdminForMutation }));
vi.mock("@/lib/shipments", () => ({
  createShipmentWithInitialEvent,
  updateShipmentMetadata,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

const shipmentId = "11111111-1111-4111-8111-111111111111";
const state = {
  message: "",
  fieldErrors: {},
  values: {
    reference: "",
    recipientName: "",
    carrierCode: "",
    carrierName: "",
    trackingNumber: "",
    originCity: "",
    originCountryCode: "",
    destinationCity: "",
    destinationCountryCode: "",
    estimatedDeliveryAt: "",
  },
};

function form(trackingNumber: string) {
  const data = new FormData();
  data.set("reference", "PT-SHIP24-TEST");
  data.set("carrierCode", "ship24-sample");
  data.set("trackingNumber", trackingNumber);
  return data;
}

describe("package actions tracking-number flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminForMutation.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    createShipmentWithInitialEvent.mockResolvedValue({ id: shipmentId });
    updateShipmentMetadata.mockResolvedValue({ id: shipmentId });
  });

  it("passes an underscore-containing Ship24 sample unchanged to Create storage", async () => {
    const { createPackageAction } = await import("./actions");
    await createPackageAction(state, form(" SHIP24_SAMPLE_IN_TRANSIT_828 "));
    expect(createShipmentWithInitialEvent).toHaveBeenCalledWith(
      expect.objectContaining({ trackingNumber: "SHIP24_SAMPLE_IN_TRANSIT_828" }),
    );
  });

  it("passes an underscore-containing Ship24 sample unchanged to Edit storage", async () => {
    const { updatePackageAction } = await import("./actions");
    await updatePackageAction(shipmentId, state, form("SHIP24_SAMPLE_IN_TRANSIT_828"));
    expect(updateShipmentMetadata).toHaveBeenCalledWith(
      shipmentId,
      expect.objectContaining({ trackingNumber: "SHIP24_SAMPLE_IN_TRANSIT_828" }),
    );
  });

  it("keeps duplicate carrier and tracking-number errors attached to the field", async () => {
    createShipmentWithInitialEvent.mockRejectedValue({
      code: "P2002",
      meta: { target: ["carrierCode", "trackingNumber"] },
    });
    const { createPackageAction } = await import("./actions");
    const result = await createPackageAction(state, form("SHIP24_SAMPLE_IN_TRANSIT_828"));
    expect(result.fieldErrors.trackingNumber).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
