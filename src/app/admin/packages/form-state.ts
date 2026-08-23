import type { PackageFormField } from "@/lib/shipment-validation";

export type PackageFormState = {
  message: string;
  fieldErrors: Partial<Record<PackageFormField, string[]>>;
  values: Record<PackageFormField, string>;
};

export const EMPTY_PACKAGE_VALUES: Record<PackageFormField, string> = {
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
};

export const INITIAL_PACKAGE_FORM_STATE: PackageFormState = {
  message: "",
  fieldErrors: {},
  values: EMPTY_PACKAGE_VALUES,
};
