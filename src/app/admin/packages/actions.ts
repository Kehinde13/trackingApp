"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { PackageFormState } from "@/app/admin/packages/form-state";
import { AdminAuthorizationError } from "@/lib/auth-guards";
import { requireAdminForMutation } from "@/lib/admin-session";
import { mapShipmentWriteError } from "@/lib/shipment-errors";
import {
  createPackageSchema,
  editPackageSchema,
  packageFormDataToRecord,
  type PackageFormField,
} from "@/lib/shipment-validation";
import {
  createShipmentWithInitialEvent,
  updateShipmentMetadata,
} from "@/lib/shipments";

function validationState(
  values: Record<PackageFormField, string>,
  fieldErrors: Record<string, string[] | undefined>,
): PackageFormState {
  return {
    message: "Check the highlighted fields and try again.",
    fieldErrors: fieldErrors as Partial<Record<PackageFormField, string[]>>,
    values,
  };
}

export async function createPackageAction(
  _previousState: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  const values = packageFormDataToRecord(formData);

  try {
    await requireAdminForMutation();
  } catch (error: unknown) {
    if (error instanceof AdminAuthorizationError) {
      return { message: "Administrator access is required.", fieldErrors: {}, values };
    }
    throw error;
  }

  const parsed = createPackageSchema.safeParse(values);
  if (!parsed.success) {
    return validationState(values, parsed.error.flatten().fieldErrors);
  }

  let shipmentId: string;
  try {
    const shipment = await createShipmentWithInitialEvent(parsed.data);
    shipmentId = shipment.id;
  } catch (error: unknown) {
    const mapped = mapShipmentWriteError(error);
    return {
      message: mapped.message,
      fieldErrors: mapped.fieldErrors ?? {},
      values,
    };
  }

  revalidatePath("/admin");
  redirect(`/admin/packages/${shipmentId}`);
}

export async function updatePackageAction(
  shipmentId: string,
  _previousState: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  const values = packageFormDataToRecord(formData);

  try {
    await requireAdminForMutation();
  } catch (error: unknown) {
    if (error instanceof AdminAuthorizationError) {
      return { message: "Administrator access is required.", fieldErrors: {}, values };
    }
    throw error;
  }

  const parsed = editPackageSchema.safeParse(values);
  if (!parsed.success) {
    return validationState(values, parsed.error.flatten().fieldErrors);
  }

  try {
    await updateShipmentMetadata(shipmentId, parsed.data);
  } catch (error: unknown) {
    const mapped = mapShipmentWriteError(error);
    return {
      message: mapped.message,
      fieldErrors: mapped.fieldErrors ?? {},
      values,
    };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/packages/${shipmentId}`);
  redirect(`/admin/packages/${shipmentId}`);
}
