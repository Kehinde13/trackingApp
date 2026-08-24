"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AdminAuthorizationError } from "@/lib/auth-guards";
import { requireAdminForMutation } from "@/lib/admin-session";
import { CarrierTrackingOperationError, registerShipmentTracking, syncShipmentTracking } from "@/lib/carrier-tracking";

export type CarrierActionState = { success: boolean; message: string };
const idSchema = z.uuid();
const carrierCodeSchema = z.union([z.literal(""), z.string().trim().regex(/^\d{1,10}$/)]);

async function authorize() {
  try { await requireAdminForMutation(); return true; }
  catch (error: unknown) {
    if (error instanceof AdminAuthorizationError) return false;
    throw error;
  }
}

export async function registerCarrierAction(shipmentId: string, _state: CarrierActionState, formData: FormData): Promise<CarrierActionState> {
  if (!(await authorize())) return { success: false, message: "Administrator access is required." };
  const carrierCode = carrierCodeSchema.safeParse(String(formData.get("providerCarrierCode") ?? "").trim());
  if (!idSchema.safeParse(shipmentId).success || !carrierCode.success) return { success: false, message: "Check the carrier tracking details and try again." };
  try {
    const result = await registerShipmentTracking(shipmentId, carrierCode.data || undefined);
    revalidatePath("/admin"); revalidatePath(`/admin/packages/${shipmentId}`);
    return { success: true, message: result.alreadyActive ? "Carrier tracking is already active." : "Carrier tracking registered." };
  } catch (error: unknown) {
    return { success: false, message: error instanceof CarrierTrackingOperationError && error.code === "PROVIDER_DISABLED" ? "Carrier tracking is not configured." : "Unable to register carrier tracking. Please try again." };
  }
}

export async function syncCarrierAction(shipmentId: string, state: CarrierActionState): Promise<CarrierActionState> {
  void state;
  if (!(await authorize())) return { success: false, message: "Administrator access is required." };
  if (!idSchema.safeParse(shipmentId).success) return { success: false, message: "Package not found." };
  try {
    const result = await syncShipmentTracking(shipmentId);
    revalidatePath("/admin"); revalidatePath(`/admin/packages/${shipmentId}`);
    return { success: true, message: `Synchronization complete. ${result.imported} new event${result.imported === 1 ? "" : "s"} imported.` };
  } catch {
    return { success: false, message: "Unable to synchronize carrier tracking. Please try again." };
  }
}
