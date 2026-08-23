"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ManualUpdateState } from "@/app/admin/packages/[id]/manual-update-state";
import { AdminAuthorizationError } from "@/lib/auth-guards";
import { requireAdminForMutation } from "@/lib/admin-session";
import {
  manualEventFormDataToRecord,
  manualEventSchema,
  type ManualEventFormField,
} from "@/lib/manual-event-validation";
import { addManualTrackingEvent, ShipmentNotFoundError } from "@/lib/manual-events";

const shipmentIdSchema = z.uuid();

export async function addManualUpdateAction(
  shipmentId: string,
  _previousState: ManualUpdateState,
  formData: FormData,
): Promise<ManualUpdateState> {
  const values = manualEventFormDataToRecord(formData);

  let actorId: string;
  try {
    const session = await requireAdminForMutation();
    actorId = session.user.id;
  } catch (error: unknown) {
    if (error instanceof AdminAuthorizationError) {
      return { success: false, message: "Administrator access is required.", fieldErrors: {}, values };
    }
    throw error;
  }

  if (!shipmentIdSchema.safeParse(shipmentId).success) {
    return { success: false, message: "Package not found.", fieldErrors: {}, values };
  }

  const parsed = manualEventSchema.safeParse(values);
  if (!parsed.success) {
    return {
      success: false,
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors as Partial<
        Record<ManualEventFormField, string[]>
      >,
      values,
    };
  }

  try {
    await addManualTrackingEvent(shipmentId, actorId, parsed.data);
  } catch (error: unknown) {
    return {
      success: false,
      message:
        error instanceof ShipmentNotFoundError
          ? "Package not found."
          : "Unable to add the tracking update. Please try again.",
      fieldErrors: {},
      values,
    };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/packages/${shipmentId}`);
  return {
    success: true,
    message: "Manual tracking update added.",
    fieldErrors: {},
    values: { ...values, description: "", location: "", city: "", countryCode: "", occurredAt: "" },
  };
}
